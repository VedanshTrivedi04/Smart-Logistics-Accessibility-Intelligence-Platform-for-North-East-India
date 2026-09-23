"""
app/modules/hazard/infrastructure/models.py — SQLAlchemy Models for Landslide Risk & Rainfall Hazard.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone

from geoalchemy2 import Geometry
from sqlalchemy import DateTime, Float, ForeignKey, Index, String
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base


class RiskZoneModel(Base):
    __tablename__ = "risk_zones"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    jurisdiction_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("jurisdictions.id", ondelete="SET NULL"),
        nullable=True,
    )
    source: Mapped[str] = mapped_column(String(32), nullable=False, default="TERRAIN_DERIVED")
    gradient_percent: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    geom = mapped_column(Geometry(geometry_type="POLYGON", srid=4326, spatial_index=True), nullable=False)
    centroid_geom = mapped_column(Geometry(geometry_type="POINT", srid=4326, spatial_index=True), nullable=False)
    related_edge_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("road_edges.id", ondelete="SET NULL"),
        nullable=True,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )

    __table_args__ = (
        Index("ix_risk_zones_jurisdiction_id", "jurisdiction_id"),
        Index("ix_risk_zones_related_edge_id", "related_edge_id"),
    )


class RainfallObservationModel(Base):
    __tablename__ = "rainfall_observations"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    risk_zone_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("risk_zones.id", ondelete="CASCADE"),
        nullable=False,
    )
    rainfall_mm_1h: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    rainfall_mm_24h: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    rainfall_mm_72h: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    observed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )
    source: Mapped[str] = mapped_column(String(64), nullable=False, default="open-meteo")

    __table_args__ = (
        Index("ix_rainfall_observations_zone_observed", "risk_zone_id", "observed_at"),
    )


class RiskAssessmentModel(Base):
    __tablename__ = "risk_assessments"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    risk_zone_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("risk_zones.id", ondelete="CASCADE"),
        nullable=False,
    )
    risk_level: Mapped[str] = mapped_column(String(16), nullable=False, default="LOW")
    risk_score: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    rainfall_mm_24h: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    rainfall_mm_72h: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    contributing_factors: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    computed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )

    __table_args__ = (
        Index("ix_risk_assessments_zone_computed", "risk_zone_id", "computed_at"),
    )
