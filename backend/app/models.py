from sqlalchemy import (
    Column,
    Integer,
    Float,
    String,
    DateTime,
    ForeignKey,
    Index,
    Text,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import relationship
from datetime import datetime, timezone
from app.database import Base


class Well(Base):
    """Stores well-level metadata from the LAS header."""

    __tablename__ = "wells"

    id = Column(Integer, primary_key=True, index=True)
    well_name = Column(String(255), nullable=False)
    s3_key = Column(String(512), nullable=True)
    original_filename = Column(String(512), nullable=False)
    start_depth = Column(Float, nullable=False)
    stop_depth = Column(Float, nullable=False)
    step = Column(Float, nullable=True)
    depth_unit = Column(String(20), default="F")
    null_value = Column(Float, default=-9999.0)
    location = Column(String(512), nullable=True)
    country = Column(String(100), nullable=True)
    company = Column(String(255), nullable=True)
    field = Column(String(255), nullable=True)
    service_company = Column(String(255), nullable=True)
    date_analyzed = Column(String(50), nullable=True)
    las_version = Column(String(20), nullable=True)
    metadata_json = Column(JSONB, nullable=True)
    uploaded_at = Column(
        DateTime, default=lambda: datetime.now(timezone.utc), nullable=False
    )

    # Relationships
    curves = relationship("Curve", back_populates="well", cascade="all, delete-orphan")
    data_rows = relationship(
        "WellData", back_populates="well", cascade="all, delete-orphan"
    )

    def __repr__(self):
        return f"<Well(id={self.id}, name='{self.well_name}')>"


class Curve(Base):
    """Stores curve metadata — one row per curve per well."""

    __tablename__ = "curves"

    id = Column(Integer, primary_key=True, index=True)
    well_id = Column(Integer, ForeignKey("wells.id", ondelete="CASCADE"), nullable=False)
    mnemonic = Column(String(100), nullable=False)
    unit = Column(String(50), nullable=True)
    description = Column(String(500), nullable=True)
    category = Column(String(100), nullable=True)

    well = relationship("Well", back_populates="curves")

    __table_args__ = (
        Index("ix_curves_well_mnemonic", "well_id", "mnemonic"),
    )

    def __repr__(self):
        return f"<Curve(id={self.id}, mnemonic='{self.mnemonic}')>"


class WellData(Base):
    """
    Stores depth-indexed curve values.
    Each row = one depth point, values stored in JSONB:
    {"HC1": 279.03, "HC2": 127.26, "TOTAL_GAS": 24.25, ...}
    """

    __tablename__ = "well_data"

    id = Column(Integer, primary_key=True, index=True)
    well_id = Column(Integer, ForeignKey("wells.id", ondelete="CASCADE"), nullable=False)
    depth = Column(Float, nullable=False)
    values = Column(JSONB, nullable=False)

    well = relationship("Well", back_populates="data_rows")

    __table_args__ = (
        Index("ix_well_data_well_depth", "well_id", "depth"),
    )

    def __repr__(self):
        return f"<WellData(well_id={self.well_id}, depth={self.depth})>"
