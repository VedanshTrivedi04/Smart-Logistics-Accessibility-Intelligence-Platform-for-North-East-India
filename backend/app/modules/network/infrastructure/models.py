"""
app/modules/network/infrastructure/models.py — SQLAlchemy Models with PostGIS Geometries.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone

from geoalchemy2 import Geometry
from sqlalchemy import (
    Boolean,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    PrimaryKeyConstraint,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import BIGINT, JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.db import Base


class NetworkVersionModel(Base):
    __tablename__ = "network_versions"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    code: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="ACTIVE")
    built_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )
    metadata_json: Mapped[dict] = mapped_column("metadata", JSONB, nullable=False, default=dict)
    status_version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)

    nodes: Mapped[list[RoadNodeModel]] = relationship(back_populates="version", cascade="all, delete-orphan")
    edges: Mapped[list[RoadEdgeModel]] = relationship(back_populates="version", cascade="all, delete-orphan")


class RoadNodeModel(Base):
    __tablename__ = "road_nodes"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    network_version_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("network_versions.id", ondelete="CASCADE"),
        nullable=False,
    )
    node_index: Mapped[int] = mapped_column(BIGINT, nullable=False)  # pgRouting vertex ID
    geom = mapped_column(Geometry(geometry_type="POINT", srid=4326, spatial_index=True), nullable=False)
    elevation_m: Mapped[float | None] = mapped_column(Float, nullable=True)
    jurisdiction_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("jurisdictions.id", ondelete="SET NULL"),
        nullable=True,
    )

    version: Mapped[NetworkVersionModel] = relationship(back_populates="nodes")

    __table_args__ = (
        UniqueConstraint("network_version_id", "node_index", name="uq_road_nodes_version_index"),
        Index("ix_road_nodes_version_id", "network_version_id"),
    )


class RoadEdgeModel(Base):
    __tablename__ = "road_edges"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    network_version_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("network_versions.id", ondelete="CASCADE"),
        nullable=False,
    )
    edge_index: Mapped[int] = mapped_column(BIGINT, nullable=False)  # pgRouting edge ID
    source_node_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("road_nodes.id", ondelete="CASCADE"),
        nullable=False,
    )
    target_node_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("road_nodes.id", ondelete="CASCADE"),
        nullable=False,
    )
    source_index: Mapped[int] = mapped_column(BIGINT, nullable=False)  # pgRouting source
    target_index: Mapped[int] = mapped_column(BIGINT, nullable=False)  # pgRouting target
    geom = mapped_column(Geometry(geometry_type="LINESTRING", srid=4326, spatial_index=True), nullable=False)
    length_meters: Mapped[float] = mapped_column(Float, nullable=False)
    road_class: Mapped[str] = mapped_column(String(32), nullable=False)
    road_name: Mapped[str | None] = mapped_column(String(128), nullable=True)
    surface_type: Mapped[str] = mapped_column(String(32), nullable=False)
    speed_limit_kmh: Mapped[int] = mapped_column(Integer, nullable=False)
    base_seconds: Mapped[float] = mapped_column(Float, nullable=False)
    reverse_base_seconds: Mapped[float] = mapped_column(Float, nullable=False)
    elevation_gain_m: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    gradient_percent: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    is_bridge: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    jurisdiction_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("jurisdictions.id", ondelete="SET NULL"),
        nullable=True,
    )

    version: Mapped[NetworkVersionModel] = relationship(back_populates="edges")
    restrictions: Mapped[list[EdgeRestrictionModel]] = relationship(back_populates="edge", cascade="all, delete-orphan")
    current_status: Mapped[EdgeStatusCurrentModel | None] = relationship(back_populates="edge", uselist=False)

    __table_args__ = (
        UniqueConstraint("network_version_id", "edge_index", name="uq_road_edges_version_index"),
        Index("ix_road_edges_source_target_index", "source_index", "target_index"),
        Index("ix_road_edges_version_id", "network_version_id"),
    )


class BridgeModel(Base):
    __tablename__ = "bridges"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    code: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    geom = mapped_column(Geometry(geometry_type="GEOMETRY", srid=4326), nullable=True)
    length_meters: Mapped[float] = mapped_column(Float, nullable=False)
    max_weight_tonnes: Mapped[float | None] = mapped_column(Float, nullable=True)
    max_height_meters: Mapped[float | None] = mapped_column(Float, nullable=True)
    max_axle_load_tonnes: Mapped[float | None] = mapped_column(Float, nullable=True)
    is_single_lane: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    structural_condition: Mapped[str] = mapped_column(String(32), nullable=False, default="GOOD")
    last_inspection_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    jurisdiction_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("jurisdictions.id", ondelete="RESTRICT"),
        nullable=False,
    )


class BridgeEdgeModel(Base):
    __tablename__ = "bridge_edges"

    bridge_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("bridges.id", ondelete="CASCADE"),
        primary_key=True,
    )
    edge_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("road_edges.id", ondelete="CASCADE"),
        primary_key=True,
    )

    __table_args__ = (
        PrimaryKeyConstraint("bridge_id", "edge_id", name="pk_bridge_edges"),
        Index("ix_bridge_edges_edge_id", "edge_id"),
    )


class EdgeRestrictionModel(Base):
    __tablename__ = "edge_restrictions"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    edge_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("road_edges.id", ondelete="CASCADE"),
        nullable=False,
    )
    kind: Mapped[str] = mapped_column(String(32), nullable=False)
    value_numeric: Mapped[float | None] = mapped_column(Float, nullable=True)
    unit: Mapped[str | None] = mapped_column(String(16), nullable=True)
    direction: Mapped[str] = mapped_column(String(16), nullable=False, default="BOTH")
    valid_from: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    valid_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    source_reference: Mapped[str | None] = mapped_column(String(255), nullable=True)

    edge: Mapped[RoadEdgeModel] = relationship(back_populates="restrictions")

    __table_args__ = (
        Index("ix_edge_restrictions_edge_id", "edge_id"),
    )


class FacilityModel(Base):
    __tablename__ = "facilities"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    code: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    kind: Mapped[str] = mapped_column(String(32), nullable=False)
    jurisdiction_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("jurisdictions.id", ondelete="RESTRICT"),
        nullable=False,
    )
    geom = mapped_column(Geometry(geometry_type="POINT", srid=4326, spatial_index=True), nullable=False)
    nearest_road_node_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("road_nodes.id", ondelete="SET NULL"),
        nullable=True,
    )
    snap_distance_m: Mapped[float | None] = mapped_column(Float, nullable=True)
    is_critical: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    __table_args__ = (
        Index("ix_facilities_kind", "kind"),
        Index("ix_facilities_jurisdiction_id", "jurisdiction_id"),
    )


class EdgeStatusEventModel(Base):
    __tablename__ = "edge_status_events"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    edge_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("road_edges.id", ondelete="CASCADE"),
        nullable=False,
    )
    status: Mapped[str] = mapped_column(String(32), nullable=False)
    restrictions: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    reason: Mapped[str] = mapped_column(Text, nullable=False)
    source_event_type: Mapped[str] = mapped_column(String(32), nullable=False)
    source_reference_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
    actor_user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    valid_from: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    valid_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )

    __table_args__ = (
        Index("ix_edge_status_events_edge_id", "edge_id"),
        Index("ix_edge_status_events_created_at", "created_at"),
    )


class EdgeStatusCurrentModel(Base):
    __tablename__ = "edge_status_current"

    edge_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("road_edges.id", ondelete="CASCADE"),
        primary_key=True,
    )
    status_version: Mapped[int] = mapped_column(BIGINT, nullable=False, default=1)
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="OPEN")
    freshness: Mapped[str] = mapped_column(String(32), nullable=False, default="FRESH")
    effective_restrictions: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    source_event_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("edge_status_events.id", ondelete="SET NULL"),
        nullable=True,
    )
    last_verified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    edge: Mapped[RoadEdgeModel] = relationship(back_populates="current_status")

    __table_args__ = (
        Index("ix_edge_status_current_status", "status"),
    )
