"""
app/modules/inspection/infrastructure/models.py — SQLAlchemy ORM Models for Inspection Module.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime

from sqlalchemy import (
    Boolean,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.db import Base


class InspectionModel(Base):
    __tablename__ = "inspections"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    jurisdiction_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("jurisdictions.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    report_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("reports.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    incident_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("incidents.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    candidate_edge_id: Mapped[str | None] = mapped_column(String(128), nullable=True, index=True)

    assigned_to: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    assigned_by: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="RESTRICT"),
        nullable=False,
    )

    priority: Mapped[str] = mapped_column(String(32), nullable=False, default="MEDIUM")
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="ASSIGNED", index=True)
    instructions: Mapped[str] = mapped_column(Text, nullable=False, default="")

    # Technical assessment measurements
    road_condition: Mapped[str | None] = mapped_column(String(128), nullable=True)
    passability: Mapped[str | None] = mapped_column(String(64), nullable=True)
    damage_type: Mapped[str | None] = mapped_column(String(64), nullable=True)
    stability: Mapped[str | None] = mapped_column(String(64), nullable=True)
    affected_length_m: Mapped[float | None] = mapped_column(Float, nullable=True)
    affected_width_m: Mapped[float | None] = mapped_column(Float, nullable=True)
    debris_depth_m: Mapped[float | None] = mapped_column(Float, nullable=True)
    bridge_pier_scour_depth_m: Mapped[float | None] = mapped_column(Float, nullable=True)
    water_level_over_road_cm: Mapped[float | None] = mapped_column(Float, nullable=True)
    slope_movement_detected: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    heavy_vehicle_passable: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    recommended_speed_limit_kmh: Mapped[int | None] = mapped_column(Integer, nullable=True)
    technical_notes: Mapped[str] = mapped_column(Text, nullable=False, default="")
    raw_measurements: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)

    final_decision: Mapped[str | None] = mapped_column(String(64), nullable=True)
    decision_notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(UTC))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(UTC), onupdate=lambda: datetime.now(UTC))

    evidence_items: Mapped[list[InspectionMediaModel]] = relationship(
        "InspectionMediaModel",
        back_populates="inspection",
        cascade="all, delete-orphan",
        lazy="selectin",
    )


class InspectionMediaModel(Base):
    __tablename__ = "inspection_media"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    inspection_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("inspections.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    media_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("media_objects.id", ondelete="CASCADE"),
        nullable=False,
    )
    kind: Mapped[str] = mapped_column(String(64), nullable=False, default="WIDE_ANGLE")
    caption: Mapped[str | None] = mapped_column(String(255), nullable=True)
    latitude: Mapped[float | None] = mapped_column(Float, nullable=True)
    longitude: Mapped[float | None] = mapped_column(Float, nullable=True)
    altitude_m: Mapped[float | None] = mapped_column(Float, nullable=True)
    azimuth_deg: Mapped[float | None] = mapped_column(Float, nullable=True)
    captured_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(UTC))

    inspection: Mapped[InspectionModel] = relationship("InspectionModel", back_populates="evidence_items")
