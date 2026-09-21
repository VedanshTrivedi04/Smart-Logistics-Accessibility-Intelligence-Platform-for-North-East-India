"""
app/modules/impact/infrastructure/models.py — SQLAlchemy ORM Models for Disruption Impact Assessment.
"""

from __future__ import annotations

from datetime import datetime, timezone
import uuid

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.db import Base


class TripImpactModel(Base):
    __tablename__ = "trip_impact_assessments"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    trip_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        sa.ForeignKey("trips.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    incident_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        sa.ForeignKey("incidents.id", ondelete="SET NULL"),
        nullable=True,
    )
    edge_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        sa.ForeignKey("road_edges.id"),
        nullable=False,
        index=True,
    )
    source_event_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    source_status_version: Mapped[int] = mapped_column(sa.Integer, nullable=False)
    assessment_version: Mapped[int] = mapped_column(sa.Integer, nullable=False, default=1)
    impact_type: Mapped[str] = mapped_column(sa.String(32), nullable=False)
    severity: Mapped[str] = mapped_column(sa.String(32), nullable=False)
    delay_estimated_seconds: Mapped[int] = mapped_column(sa.Integer, nullable=False, default=0)
    distance_to_disruption_meters: Mapped[int | None] = mapped_column(sa.Integer, nullable=True)
    recommended_action: Mapped[str] = mapped_column(sa.String(64), nullable=False)
    is_active: Mapped[bool] = mapped_column(sa.Boolean, nullable=False, default=True, index=True)
    resolved_reason: Mapped[str | None] = mapped_column(sa.String(64), nullable=True)
    assessed_at: Mapped[datetime] = mapped_column(
        sa.DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )

    # Relationships
    commitment_impacts: Mapped[list[CommitmentImpactModel]] = relationship(
        "CommitmentImpactModel",
        back_populates="trip_impact",
        cascade="all, delete-orphan",
    )


class CommitmentImpactModel(Base):
    __tablename__ = "commitment_impact_assessments"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    delivery_commitment_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        sa.ForeignKey("delivery_commitments.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    trip_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        sa.ForeignKey("trips.id"),
        nullable=False,
    )
    trip_impact_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        sa.ForeignKey("trip_impact_assessments.id", ondelete="CASCADE"),
        nullable=False,
    )
    original_required_before: Mapped[datetime] = mapped_column(sa.DateTime(timezone=True), nullable=False)
    projected_arrival: Mapped[datetime] = mapped_column(sa.DateTime(timezone=True), nullable=False)
    projected_sla_status: Mapped[str] = mapped_column(sa.String(32), nullable=False)  # ON_TIME, AT_RISK, BREACHED
    delay_seconds: Mapped[int] = mapped_column(sa.Integer, nullable=False)
    assessed_at: Mapped[datetime] = mapped_column(
        sa.DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )

    trip_impact: Mapped[TripImpactModel] = relationship("TripImpactModel", back_populates="commitment_impacts")


class FacilityReachabilityImpactModel(Base):
    __tablename__ = "facility_reachability_impacts"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    facility_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        sa.ForeignKey("facilities.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    incident_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        sa.ForeignKey("incidents.id", ondelete="SET NULL"),
        nullable=True,
    )
    edge_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        sa.ForeignKey("road_edges.id"),
        nullable=False,
    )
    source_status_version: Mapped[int] = mapped_column(sa.Integer, nullable=False)
    reachability_state: Mapped[str] = mapped_column(sa.String(32), nullable=False)
    isolated: Mapped[bool] = mapped_column(sa.Boolean, nullable=False, default=False)
    alternate_route_available: Mapped[bool] = mapped_column(sa.Boolean, nullable=False, default=True)
    access_delay_seconds: Mapped[int] = mapped_column(sa.Integer, nullable=False, default=0)
    assessed_at: Mapped[datetime] = mapped_column(
        sa.DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )
