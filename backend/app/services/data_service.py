import logging
from sqlalchemy.orm import Session
from sqlalchemy import and_
from app.models import Well, Curve, WellData

logger = logging.getLogger(__name__)


def store_parsed_las(db: Session, parsed: dict, original_filename: str, s3_key: str | None) -> Well:
    """
    Store parsed LAS data into the database.
    Returns the created Well object.
    """
    info = parsed["well_info"]
    well_name = info["well_name"]

    # Deduplication: remove existing well with same name
    existing_well = db.query(Well).filter(Well.well_name == well_name).first()
    if existing_well:
        logger.info(f"Overwriting existing well '{well_name}' (id={existing_well.id})")
        db.delete(existing_well)
        db.flush()

    # Create well record
    well = Well(
        well_name=well_name,
        original_filename=original_filename,
        s3_key=s3_key,
        start_depth=info["start_depth"],
        stop_depth=info["stop_depth"],
        step=info["step"],
        depth_unit=info.get("depth_unit", "F"),
        null_value=info["null_value"],
        location=info.get("location"),
        country=info.get("country"),
        company=info.get("company"),
        field=info.get("field"),
        service_company=info.get("service_company"),
        date_analyzed=info.get("date_analyzed"),
        las_version=info.get("las_version"),
    )
    db.add(well)
    db.flush()  # get the well.id

    # Create curve records
    for c in parsed["curves"]:
        curve = Curve(
            well_id=well.id,
            mnemonic=c["mnemonic"],
            unit=c["unit"],
            description=c["description"],
            category=c.get("category", "Other"),
        )
        db.add(curve)

    # Bulk insert data rows
    data_objects = []
    for row in parsed["data_rows"]:
        data_objects.append(
            WellData(well_id=well.id, depth=row["depth"], values=row["values"])
        )

    # Batch insert for performance
    BATCH_SIZE = 1000
    for i in range(0, len(data_objects), BATCH_SIZE):
        db.bulk_save_objects(data_objects[i : i + BATCH_SIZE])

    db.commit()
    db.refresh(well)

    logger.info(
        f"Stored well '{well.well_name}' (id={well.id}): "
        f"{len(parsed['curves'])} curves, {len(data_objects)} rows"
    )
    return well


def get_well_data(
    db: Session,
    well_id: int,
    curves: list[str],
    depth_min: float | None = None,
    depth_max: float | None = None,
) -> list[dict]:
    """
    Query depth-indexed data for specific curves and depth range.
    Returns list of dicts: [{"depth": 8665.0, "HC1": 279.03, "HC2": 127.26}, ...]
    """
    query = db.query(WellData).filter(WellData.well_id == well_id)

    if depth_min is not None:
        query = query.filter(WellData.depth >= depth_min)
    if depth_max is not None:
        query = query.filter(WellData.depth <= depth_max)

    query = query.order_by(WellData.depth)
    rows = query.all()

    result = []
    for row in rows:
        point = {"depth": row.depth}
        for curve in curves:
            point[curve] = row.values.get(curve)
        result.append(point)

    return result


def get_well_statistics(
    db: Session,
    well_id: int,
    curves: list[str],
    depth_min: float | None = None,
    depth_max: float | None = None,
) -> dict:
    """
    Compute basic statistics for selected curves over a depth range.
    Returns: {curve_name: {min, max, mean, count, non_null_count}, ...}
    """
    data = get_well_data(db, well_id, curves, depth_min, depth_max)

    stats = {}
    for curve in curves:
        values = [p[curve] for p in data if p.get(curve) is not None]
        if values:
            stats[curve] = {
                "min": round(min(values), 4),
                "max": round(max(values), 4),
                "mean": round(sum(values) / len(values), 4),
                "count": len(data),
                "non_null_count": len(values),
            }
        else:
            stats[curve] = {
                "min": None, "max": None, "mean": None,
                "count": len(data), "non_null_count": 0,
            }

    return stats
