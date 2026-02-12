import logging
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Well, Curve
from app.schemas import InterpretationRequest, InterpretationResponse
from app.services.data_service import get_well_data, get_well_statistics
from app.services.ai_service import interpret_well_data

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/wells", tags=["Interpretation"])


@router.post("/{well_id}/interpret", response_model=InterpretationResponse)
def interpret(
    well_id: int, request: InterpretationRequest, db: Session = Depends(get_db)
):
    """
    AI-assisted interpretation of selected curves over a depth range.
    """
    well = db.query(Well).filter(Well.id == well_id).first()
    if not well:
        raise HTTPException(status_code=404, detail="Well not found.")

    # Validate curves
    available = {
        c.mnemonic
        for c in db.query(Curve).filter(Curve.well_id == well_id).all()
    }
    invalid = set(request.curves) - available
    if invalid:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid curves: {', '.join(invalid)}",
        )

    # Validate depth range
    if request.depth_min >= request.depth_max:
        raise HTTPException(
            status_code=400, detail="depth_min must be less than depth_max."
        )

    # Get statistics
    stats = get_well_statistics(
        db, well_id, request.curves, request.depth_min, request.depth_max
    )

    # Get sample data for the AI prompt
    data = get_well_data(
        db, well_id, request.curves, request.depth_min, request.depth_max
    )

    # Run AI interpretation
    interpretation = interpret_well_data(
        well_name=well.well_name,
        curves=request.curves,
        depth_min=request.depth_min,
        depth_max=request.depth_max,
        statistics=stats,
        sample_data=data,
    )

    return InterpretationResponse(
        well_id=well.id,
        well_name=well.well_name,
        depth_range={
            "min": request.depth_min,
            "max": request.depth_max,
            "unit": well.depth_unit,
        },
        curves_analyzed=request.curves,
        interpretation=interpretation,
    )
