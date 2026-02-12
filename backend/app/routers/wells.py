import os
import uuid
import logging
from fastapi import APIRouter, UploadFile, File, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import Optional

from app.database import get_db
from app.models import Well, Curve, WellData
from app.schemas import (
    WellSummary, WellDetail, CurveInfo,
    DataResponse, UploadResponse,
)
from app.services.las_parser import parse_las_file
from app.services.data_service import store_parsed_las, get_well_data
from app.services.s3_service import s3_service
from app.config import settings

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/wells", tags=["Wells"])


@router.post("/upload", response_model=UploadResponse)
async def upload_las_file(file: UploadFile = File(...), db: Session = Depends(get_db)):
    """
    Upload a LAS file: parse it, store original in S3, save data to PostgreSQL.
    """
    if not file.filename.lower().endswith(".las"):
        raise HTTPException(status_code=400, detail="Only .las files are accepted.")

    # Read the file contents
    content = await file.read()
    if len(content) > settings.MAX_UPLOAD_SIZE_MB * 1024 * 1024:
        raise HTTPException(
            status_code=400,
            detail=f"File too large. Max size: {settings.MAX_UPLOAD_SIZE_MB}MB",
        )

    # Parse the LAS file
    try:
        parsed = parse_las_file(content)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    # Upload original file to S3
    s3_key = f"las-files/{uuid.uuid4().hex}_{file.filename}"
    s3_success = s3_service.upload_bytes(content, s3_key)
    if not s3_success:
        s3_key = None  # still continue without S3
        logger.warning("S3 upload skipped — continuing without S3 storage.")

    # Store in database
    try:
        well = store_parsed_las(db, parsed, file.filename, s3_key)
    except Exception as e:
        logger.error(f"Database storage failed: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to store data: {e}")

    return UploadResponse(
        well_id=well.id,
        well_name=well.well_name,
        s3_key=s3_key,
        curve_count=len(parsed["curves"]),
        data_points=len(parsed["data_rows"]),
        depth_range={
            "min": well.start_depth,
            "max": well.stop_depth,
            "unit": well.depth_unit,
        },
        message=f"Successfully uploaded and parsed '{file.filename}'.",
    )


@router.get("", response_model=list[WellSummary])
def list_wells(db: Session = Depends(get_db)):
    """List all uploaded wells."""
    wells = db.query(Well).order_by(Well.uploaded_at.desc()).all()
    result = []
    for w in wells:
        curve_count = db.query(Curve).filter(Curve.well_id == w.id).count()
        result.append(
            WellSummary(
                id=w.id,
                well_name=w.well_name,
                original_filename=w.original_filename,
                start_depth=w.start_depth,
                stop_depth=w.stop_depth,
                depth_unit=w.depth_unit,
                location=w.location,
                country=w.country,
                uploaded_at=w.uploaded_at,
                curve_count=curve_count,
            )
        )
    return result


@router.get("/{well_id}", response_model=WellDetail)
def get_well(well_id: int, db: Session = Depends(get_db)):
    """Get detailed well metadata and available curves."""
    well = db.query(Well).filter(Well.id == well_id).first()
    if not well:
        raise HTTPException(status_code=404, detail="Well not found.")

    curves = db.query(Curve).filter(Curve.well_id == well_id).all()

    return WellDetail(
        id=well.id,
        well_name=well.well_name,
        original_filename=well.original_filename,
        s3_key=well.s3_key,
        start_depth=well.start_depth,
        stop_depth=well.stop_depth,
        step=well.step,
        depth_unit=well.depth_unit,
        null_value=well.null_value,
        location=well.location,
        country=well.country,
        company=well.company,
        field=well.field,
        service_company=well.service_company,
        date_analyzed=well.date_analyzed,
        las_version=well.las_version,
        uploaded_at=well.uploaded_at,
        curves=[
            CurveInfo(
                mnemonic=c.mnemonic,
                unit=c.unit,
                description=c.description,
                category=c.category,
            )
            for c in curves
        ],
    )


@router.get("/{well_id}/data", response_model=DataResponse)
def get_data(
    well_id: int,
    curves: str = Query(..., description="Comma-separated curve mnemonics"),
    depth_min: Optional[float] = Query(None),
    depth_max: Optional[float] = Query(None),
    db: Session = Depends(get_db),
):
    """
    Get curve data for visualization.
    Curves are comma-separated: ?curves=HC1,HC2,TOTAL_GAS&depth_min=9000&depth_max=10000
    """
    well = db.query(Well).filter(Well.id == well_id).first()
    if not well:
        raise HTTPException(status_code=404, detail="Well not found.")

    curve_list = [c.strip() for c in curves.split(",") if c.strip()]
    if not curve_list:
        raise HTTPException(status_code=400, detail="At least one curve is required.")

    # Validate curves exist
    available = {c.mnemonic for c in db.query(Curve).filter(Curve.well_id == well_id).all()}
    invalid = set(curve_list) - available
    if invalid:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid curves: {', '.join(invalid)}. Available: {', '.join(sorted(available)[:20])}...",
        )

    data = get_well_data(db, well_id, curve_list, depth_min, depth_max)

    return DataResponse(
        well_id=well.id,
        well_name=well.well_name,
        depth_range={
            "min": depth_min or well.start_depth,
            "max": depth_max or well.stop_depth,
            "unit": well.depth_unit,
        },
        curves=curve_list,
        data=data,
    )


@router.delete("/{well_id}")
def delete_well(well_id: int, db: Session = Depends(get_db)):
    """Delete a well and all its data."""
    well = db.query(Well).filter(Well.id == well_id).first()
    if not well:
        raise HTTPException(status_code=404, detail="Well not found.")
    db.delete(well)
    db.commit()
    return {"message": f"Well '{well.well_name}' (id={well_id}) deleted."}
