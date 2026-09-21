"""
app/modules/routing/infrastructure/models.py — SQLAlchemy ORM Models for Routing.
"""

from __future__ import annotations

from datetime import datetime, timezone
import uuid

from geoalchemy2 import Geometry
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.db import Base


class RoutePlanModel(Base):
    __tablename__ = "route_plans"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        sa.ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
    )
    trip_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        sa.ForeignKey("trips.id", ondelete="SET NULL"),
        nullable=True,
    )
    network_version_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        sa.ForeignKey("network_versions.id"),
        nullable=False,
    )
    graph_version: Mapped[str] = mapped_column(sa.String(64), nullable=False)
    status_version: Mapped[int] = mapped_column(sa.Integer, nullable=False)
    policy_version: Mapped[str] = mapped_column(
        sa.String(32),
        nullable=False,
        default="CONSERVATIVE_CRITICAL_V1",
    )
    origin_node_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        sa.ForeignKey("road_nodes.id"),
        nullable=False,
    )
    destination_node_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        sa.ForeignKey("road_nodes.id"),
        nullable=False,
    )
    result_status: Mapped[str] = mapped_column(sa.String(32), nullable=False)
    total_distance_meters: Mapped[int] = mapped_column(sa.Integer, nullable=False)
    total_duration_seconds: Mapped[int] = mapped_column(sa.Integer, nullable=False)
    risk_penalty_score: Mapped[float] = mapped_column(sa.Numeric(8, 2), nullable=False, default=0.0)
    requires_human_review: Mapped[bool] = mapped_column(sa.Boolean, nullable=False, default=False)
    excluded_edge_reasons: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    primary_geometry = mapped_column(Geometry(geometry_type="LINESTRING", srid=4326, spatial_index=True), nullable=True)
    alternative_geometries: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)

    # Vehicle constraints snapshot
    vehicle_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        sa.ForeignKey("vehicles.id", ondelete="SET NULL"),
        nullable=True,
    )
    vehicle_weight_kg: Mapped[float] = mapped_column(sa.Numeric(10, 2), nullable=False)
    vehicle_height_m: Mapped[float] = mapped_column(sa.Numeric(4, 2), nullable=False)
    is_hazmat: Mapped[bool] = mapped_column(sa.Boolean, nullable=False, default=False)
    cargo_priority: Mapped[str] = mapped_column(sa.String(32), nullable=False, default="TIER_3_STANDARD")
    departure_time: Mapped[datetime] = mapped_column(sa.DateTime(timezone=True), nullable=False)

    evaluated_at: Mapped[datetime] = mapped_column(
        sa.DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )
    expires_at: Mapped[datetime] = mapped_column(sa.DateTime(timezone=True), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        sa.DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )

    edges: Mapped[list[RoutePlanEdgeModel]] = relationship(
        back_populates="route_plan",
        cascade="all, delete-orphan",
        order_by="RoutePlanEdgeModel.sequence_order",
    )


class RoutePlanEdgeModel(Base):
    __tablename__ = "route_plan_edges"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    route_plan_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        sa.ForeignKey("route_plans.id", ondelete="CASCADE"),
        nullable=False,
    )
    edge_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        sa.ForeignKey("road_edges.id"),
        nullable=False,
    )
    sequence_order: Mapped[int] = mapped_column(sa.Integer, nullable=False)
    cumulative_distance_meters: Mapped[int] = mapped_column(sa.Integer, nullable=False)
    cumulative_duration_seconds: Mapped[int] = mapped_column(sa.Integer, nullable=False)
    is_alternative: Mapped[bool] = mapped_column(sa.Boolean, nullable=False, default=False)
    alternative_rank: Mapped[int] = mapped_column(sa.Integer, nullable=False, default=0)

    route_plan: Mapped[RoutePlanModel] = relationship(back_populates="edges")


class DispatchDecisionModel(Base):
    __tablename__ = "dispatch_decisions"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    trip_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        sa.ForeignKey("trips.id", ondelete="CASCADE"),
        nullable=False,
    )
    route_plan_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        sa.ForeignKey("route_plans.id"),
        nullable=False,
    )
    actor_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        sa.ForeignKey("users.id"),
        nullable=False,
    )
    action: Mapped[str] = mapped_column(sa.String(32), nullable=False)
    selected_alternative_rank: Mapped[int] = mapped_column(sa.Integer, nullable=False, default=0)
    reason: Mapped[str] = mapped_column(sa.Text, nullable=False)
    status_version_at_decision: Mapped[int] = mapped_column(sa.Integer, nullable=False)
    decided_at: Mapped[datetime] = mapped_column(
        sa.DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )
    created_at: Mapped[datetime] = mapped_column(
        sa.DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )
