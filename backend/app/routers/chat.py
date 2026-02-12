import logging
import re
from math import sqrt
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Well, Curve
from app.schemas import ChatRequest, ChatResponse
from app.services.data_service import get_well_data, get_well_statistics
from app.services.ai_service import chat_with_data

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api", tags=["Chat"])

MAX_CONTEXT_CURVES = 12
DEFAULT_CONTEXT_CURVES = [
    "TOTAL_GAS",
    "HC1",
    "HC2",
    "HC3",
    "HC4",
    "HC5",
    "HC6",
    "ROP(ft/hr)",
    "ROP(MIN/FT)",
    "AROM",
    "BEN_TOL",
    "NAPH",
    "PARA",
]


def _select_context_curves(requested_curves: list[str], available_curves: list[Curve]) -> tuple[list[str], list[str], str]:
    available_names = {curve.mnemonic for curve in available_curves}
    selected: list[str] = []
    ignored: list[str] = []

    for curve in requested_curves:
        if curve in available_names and curve not in selected:
            selected.append(curve)
        elif curve not in available_names and curve not in ignored:
            ignored.append(curve)

    if selected:
        return selected[:MAX_CONTEXT_CURVES], ignored, "user_selected"

    fallback = [curve for curve in DEFAULT_CONTEXT_CURVES if curve in available_names]
    if len(fallback) < MAX_CONTEXT_CURVES:
        for curve in sorted(available_names):
            if curve not in fallback:
                fallback.append(curve)
            if len(fallback) >= MAX_CONTEXT_CURVES:
                break

    return fallback[:MAX_CONTEXT_CURVES], ignored, "default_subset"


def _normalize_depth_range(request_min: float | None, request_max: float | None, well: Well) -> tuple[float, float]:
    depth_min = request_min if request_min is not None else well.start_depth
    depth_max = request_max if request_max is not None else well.stop_depth

    depth_min = max(well.start_depth, min(depth_min, well.stop_depth))
    depth_max = max(well.start_depth, min(depth_max, well.stop_depth))

    if depth_min >= depth_max:
        return well.start_depth, well.stop_depth

    return depth_min, depth_max


def _format_stats_text(stats: dict) -> str:
    if not stats:
        return "- No statistics available."

    lines = []
    for curve, curve_stats in stats.items():
        valid_points = curve_stats.get("non_null_count", 0)
        if valid_points > 0:
            lines.append(
                f"- {curve}: min={curve_stats['min']}, max={curve_stats['max']}, "
                f"mean={curve_stats['mean']} ({valid_points} valid points)"
            )
        else:
            lines.append(f"- {curve}: no valid points in this interval")
    return "\n".join(lines)


def _normalize_token(text: str) -> str:
    return re.sub(r"[^A-Z0-9]", "", text.upper())


def _extract_mentioned_curves(message: str, available_curve_names: list[str]) -> list[str]:
    if not message:
        return []

    raw_message = message.upper()
    normalized_message = _normalize_token(message)
    matches: list[str] = []

    # Match longer names first to avoid smaller partial collisions.
    for curve in sorted(available_curve_names, key=len, reverse=True):
        curve_upper = curve.upper()
        curve_normalized = _normalize_token(curve)
        if curve_upper in raw_message or (curve_normalized and curve_normalized in normalized_message):
            if curve not in matches:
                matches.append(curve)
    return matches


def _pick_focus_curves(
    mentioned_curves: list[str],
    curves_in_scope: list[str],
    stats: dict,
    max_curves: int = 4,
) -> list[str]:
    focus: list[str] = []

    for curve in mentioned_curves:
        if curve in curves_in_scope and curve not in focus:
            focus.append(curve)
        if len(focus) >= max_curves:
            return focus

    scored: list[tuple[float, str]] = []
    for curve in curves_in_scope:
        s = stats.get(curve, {})
        if s.get("non_null_count", 0) <= 0:
            continue
        cmin = s.get("min")
        cmax = s.get("max")
        if cmin is None or cmax is None:
            continue
        scored.append((float(cmax) - float(cmin), curve))

    for _, curve in sorted(scored, key=lambda x: x[0], reverse=True):
        if curve not in focus:
            focus.append(curve)
        if len(focus) >= max_curves:
            return focus

    for curve in curves_in_scope:
        if curve not in focus:
            focus.append(curve)
        if len(focus) >= max_curves:
            break

    return focus


def _mean(values: list[float]) -> float | None:
    if not values:
        return None
    return sum(values) / len(values)


def _trend_label(values: list[float]) -> str:
    if len(values) < 12:
        return "insufficient points for trend"

    window = max(3, len(values) // 5)
    first_mean = _mean(values[:window])
    last_mean = _mean(values[-window:])
    if first_mean is None or last_mean is None:
        return "insufficient points for trend"

    delta = last_mean - first_mean
    scale = max(abs(first_mean), abs(last_mean), 1e-9)
    relative_change = delta / scale

    if relative_change >= 0.08:
        return "increasing with depth"
    if relative_change <= -0.08:
        return "decreasing with depth"
    return "mostly stable"


def _pearson_correlation(values_a: list[float], values_b: list[float]) -> float | None:
    n = min(len(values_a), len(values_b))
    if n < 3:
        return None

    a = values_a[:n]
    b = values_b[:n]
    mean_a = _mean(a)
    mean_b = _mean(b)
    if mean_a is None or mean_b is None:
        return None

    num = sum((x - mean_a) * (y - mean_b) for x, y in zip(a, b))
    den_a = sum((x - mean_a) ** 2 for x in a)
    den_b = sum((y - mean_b) ** 2 for y in b)
    den = sqrt(den_a * den_b)
    if den == 0:
        return None
    return num / den


def _format_query_analytics(
    rows: list[dict],
    focus_curves: list[str],
    depth_unit: str,
) -> str:
    if not rows or not focus_curves:
        return "- No row-level analytics available for this question."

    max_rows = 3500
    stride = max(1, len(rows) // max_rows)
    sampled_rows = rows[::stride]
    lines: list[str] = []
    values_by_curve: dict[str, list[float]] = {}

    for curve in focus_curves:
        pairs: list[tuple[float, float]] = []
        for row in sampled_rows:
            depth_raw = row.get("depth")
            value_raw = row.get(curve)
            if depth_raw is None or value_raw is None:
                continue
            try:
                depth = float(depth_raw)
                value = float(value_raw)
            except (TypeError, ValueError):
                continue
            pairs.append((depth, value))

        if len(pairs) < 3:
            lines.append(f"- {curve}: not enough valid points for trend/zone analysis.")
            continue

        depths = [d for d, _ in pairs]
        values = [v for _, v in pairs]
        values_by_curve[curve] = values

        cmin = min(values)
        cmax = max(values)
        cmean = _mean(values)
        max_idx = values.index(cmax)
        min_idx = values.index(cmin)
        trend = _trend_label(values)

        sorted_values = sorted(values)
        n_sv = len(sorted_values)
        p90_pos = 0.9 * (n_sv - 1)
        p90_lo = int(p90_pos)
        p90_hi = min(p90_lo + 1, n_sv - 1)
        p90_frac = p90_pos - p90_lo
        p90 = sorted_values[p90_lo] + p90_frac * (sorted_values[p90_hi] - sorted_values[p90_lo])
        high_zone_depths = [d for d, v in pairs if v >= p90]
        high_zone_text = (
            f"{min(high_zone_depths):.1f}-{max(high_zone_depths):.1f} {depth_unit}"
            if high_zone_depths else "n/a"
        )

        lines.append(
            f"- {curve}: trend={trend}; mean={cmean:.3f}; "
            f"max={cmax:.3f} at {depths[max_idx]:.1f} {depth_unit}; "
            f"min={cmin:.3f} at {depths[min_idx]:.1f} {depth_unit}; "
            f"high-response zone(p90+)={high_zone_text}"
        )

    if len(focus_curves) >= 2:
        c1, c2 = focus_curves[0], focus_curves[1]
        if c1 in values_by_curve and c2 in values_by_curve:
            corr = _pearson_correlation(values_by_curve[c1], values_by_curve[c2])
            if corr is None:
                lines.append(f"- {c1} vs {c2}: correlation unavailable (insufficient variation).")
            else:
                strength = (
                    "strong" if abs(corr) >= 0.7
                    else "moderate" if abs(corr) >= 0.4
                    else "weak"
                )
                direction = "positive" if corr >= 0 else "negative"
                lines.append(
                    f"- {c1} vs {c2}: {strength} {direction} correlation (r={corr:.3f}) in current scope."
                )

    return "\n".join(lines) if lines else "- No row-level analytics available for this question."


@router.post("/chat", response_model=ChatResponse)
def chat(request: ChatRequest, db: Session = Depends(get_db)):
    """
    Chatbot endpoint: answer questions about well data.
    """
    well = db.query(Well).filter(Well.id == request.well_id).first()
    if not well:
        raise HTTPException(status_code=404, detail="Well not found.")

    curves = db.query(Curve).filter(Curve.well_id == well.id).all()
    curve_names = [curve.mnemonic for curve in curves]
    curves_in_scope, ignored_curves, source = _select_context_curves(request.curves, curves)
    depth_min, depth_max = _normalize_depth_range(request.depth_min, request.depth_max, well)

    stats = get_well_statistics(
        db,
        well.id,
        curves_in_scope,
        depth_min=depth_min,
        depth_max=depth_max,
    ) if curves_in_scope else {}
    rows = get_well_data(
        db,
        well.id,
        curves_in_scope,
        depth_min=depth_min,
        depth_max=depth_max,
    ) if curves_in_scope else []
    mentioned_curves = _extract_mentioned_curves(request.message, curve_names)
    focus_curves = _pick_focus_curves(mentioned_curves, curves_in_scope, stats, max_curves=4)
    query_analytics = _format_query_analytics(rows, focus_curves, well.depth_unit)

    category_map: dict[str, list[str]] = {}
    for curve in curves:
        if curve.mnemonic in curves_in_scope:
            category = curve.category or "Other"
            category_map.setdefault(category, []).append(curve.mnemonic)

    category_lines = [
        f"- {category}: {', '.join(sorted(mnemonics))}"
        for category, mnemonics in sorted(category_map.items())
    ]
    categories_text = "\n".join(category_lines) if category_lines else "- Not categorized"

    scope_label = "User-selected visualization scope" if source == "user_selected" else "Default subset scope"
    ignored_text = f"\nIgnored unknown curves from request: {', '.join(ignored_curves)}" if ignored_curves else ""

    well_summary = (
        f"Well: {well.well_name}\n"
        f"Location: {well.location or 'Unknown'}\n"
        f"Country: {well.country or 'Unknown'}\n"
        f"Full depth range: {well.start_depth} - {well.stop_depth} {well.depth_unit}\n"
        f"Sampling step: {well.step if well.step is not None else 'Unknown'} {well.depth_unit}\n"
        f"Total curves available: {len(curve_names)}\n"
        f"Date analyzed: {well.date_analyzed or 'Unknown'}\n"
    )

    data_context = (
        f"Current analysis scope ({scope_label}):\n"
        f"- Depth window: {depth_min} - {depth_max} {well.depth_unit}\n"
        f"- Curves in scope ({len(curves_in_scope)}): {', '.join(curves_in_scope)}\n"
        f"- Requested response detail level (1-5): {request.detail_level}\n"
        f"- Categories in scope:\n{categories_text}\n"
        f"- Curve statistics in current scope:\n{_format_stats_text(stats)}"
        f"{ignored_text}\n\n"
        f"Question-specific context:\n"
        f"- User question: {request.message}\n"
        f"- Curves mentioned by user: {', '.join(mentioned_curves) if mentioned_curves else 'none explicitly'}\n"
        f"- Focus curves for this reply: {', '.join(focus_curves) if focus_curves else 'none'}\n"
        f"- Focus analytics:\n{query_analytics}\n\n"
        "Important scope rule: prioritize this selected depth window and curve set. "
        "Only reference full-well behavior when the user explicitly asks."
    )

    # Call AI
    response = chat_with_data(
        well_name=well.well_name,
        message=request.message,
        history=[h.model_dump() for h in request.history][-12:],
        well_summary=well_summary,
        data_context=data_context,
        detail_level=request.detail_level,
    )

    return ChatResponse(response=response, well_id=well.id)
