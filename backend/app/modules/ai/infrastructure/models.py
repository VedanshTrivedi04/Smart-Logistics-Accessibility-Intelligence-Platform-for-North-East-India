"""
app/modules/ai/infrastructure/models.py — SQLAlchemy Models for AI/ML Feature Store.
"""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import DateTime, Float, ForeignKey, Index, String, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base


class EdgeTerrainFeaturesModel(Base):
    """Static topographical features for a road edge (computed once from DEM)."""

    __tablename__ = "edge_terrain_features"

    edge_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("road_edges.id", ondelete="CASCADE"),
        primary_key=True,
    )
    elevation_min_m: Mapped[float] = mapped_column(Float, nullable=False)
    elevation_max_m: Mapped[float] = mapped_column(Float, nullable=False)
    elevation_mean_m: Mapped[float] = mapped_column(Float, nullable=False)
    slope_pct: Mapped[float] = mapped_column(Float, nullable=False)
    aspect_deg: Mapped[float] = mapped_column(Float, nullable=False)
    curvature_index: Mapped[float] = mapped_column(Float, nullable=False)
    susceptibility_zone: Mapped[str] = mapped_column(String(16), nullable=False)
    distance_to_stream_m: Mapped[float] = mapped_column(Float, nullable=False)
    computed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )


class EdgeWeatherFeaturesModel(Base):
    """Time-series dynamic weather/rainfall features for a road edge."""

    __tablename__ = "edge_weather_features"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    edge_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("road_edges.id", ondelete="CASCADE"),
        nullable=False,
    )
    observed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    rainfall_24h_mm: Mapped[float] = mapped_column(Float, nullable=False)
    rainfall_48h_mm: Mapped[float] = mapped_column(Float, nullable=False)
    rainfall_72h_mm: Mapped[float] = mapped_column(Float, nullable=False)
    ari_score: Mapped[float] = mapped_column(Float, nullable=False)
    forecast_rainfall_3h_mm: Mapped[float] = mapped_column(Float, nullable=False)
    forecast_rainfall_6h_mm: Mapped[float] = mapped_column(Float, nullable=False)
    forecast_rainfall_12h_mm: Mapped[float] = mapped_column(Float, nullable=False)
    soil_moisture_index: Mapped[float] = mapped_column(Float, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    __table_args__ = (
        UniqueConstraint("edge_id", "observed_at", name="uq_edge_weather_features_edge_observed"),
        Index("ix_edge_weather_features_edge_observed", "edge_id", "observed_at"),
    )


class LandslideEventModel(Base):
    """Historical landslide/disruption event, used as a supervised-learning label."""

    __tablename__ = "landslide_events"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    edge_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("road_edges.id", ondelete="SET NULL"),
        nullable=True,
    )
    longitude: Mapped[float] = mapped_column(Float, nullable=False)
    latitude: Mapped[float] = mapped_column(Float, nullable=False)
    occurred_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    source: Mapped[str] = mapped_column(String(32), nullable=False)
    severity: Mapped[str | None] = mapped_column(String(16), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    __table_args__ = (
        Index("ix_landslide_events_edge_id", "edge_id"),
        Index("ix_landslide_events_occurred_at", "occurred_at"),
    )
