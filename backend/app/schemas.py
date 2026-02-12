from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime


# ── Well Schemas ──────────────────────────────────────────────

class CurveInfo(BaseModel):
    mnemonic: str
    unit: Optional[str] = None
    description: Optional[str] = None
    category: Optional[str] = None

    class Config:
        from_attributes = True


class WellSummary(BaseModel):
    id: int
    well_name: str
    original_filename: str
    start_depth: float
    stop_depth: float
    depth_unit: str
    location: Optional[str] = None
    country: Optional[str] = None
    uploaded_at: datetime
    curve_count: Optional[int] = None

    class Config:
        from_attributes = True


class WellDetail(BaseModel):
    id: int
    well_name: str
    original_filename: str
    s3_key: Optional[str] = None
    start_depth: float
    stop_depth: float
    step: Optional[float] = None
    depth_unit: str
    null_value: float
    location: Optional[str] = None
    country: Optional[str] = None
    company: Optional[str] = None
    field: Optional[str] = None
    service_company: Optional[str] = None
    date_analyzed: Optional[str] = None
    las_version: Optional[str] = None
    uploaded_at: datetime
    curves: list[CurveInfo] = []

    class Config:
        from_attributes = True


# ── Data Schemas ──────────────────────────────────────────────

class DataQuery(BaseModel):
    curves: list[str]
    depth_min: Optional[float] = None
    depth_max: Optional[float] = None


class DataResponse(BaseModel):
    well_id: int
    well_name: str
    depth_range: dict
    curves: list[str]
    data: list[dict]


# ── Interpretation Schemas ────────────────────────────────────

class InterpretationRequest(BaseModel):
    curves: list[str]
    depth_min: float
    depth_max: float


class InterpretationResponse(BaseModel):
    well_id: int
    well_name: str
    depth_range: dict
    curves_analyzed: list[str]
    interpretation: dict


# ── Chat Schemas ──────────────────────────────────────────────

class ChatMessage(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    well_id: int
    message: str
    history: list[ChatMessage] = Field(default_factory=list)
    curves: list[str] = Field(default_factory=list)
    depth_min: Optional[float] = None
    depth_max: Optional[float] = None
    detail_level: int = Field(default=3, ge=1, le=5)


class ChatResponse(BaseModel):
    response: str
    well_id: int


# ── Upload Response ───────────────────────────────────────────

class UploadResponse(BaseModel):
    well_id: int
    well_name: str
    s3_key: Optional[str] = None
    curve_count: int
    data_points: int
    depth_range: dict
    message: str
