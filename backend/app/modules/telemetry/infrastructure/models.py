"""
app/modules/telemetry/infrastructure/models.py — SQLAlchemy declarative models for Telemetry.
"""

from __future__ import annotations

import uuid
from datetime import datetime

from geoalchemy2 import Geometry
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base


class DeviceModel(Base):
    __tablename__ = "devices"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False)
    vehicle_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), sa.ForeignKey("vehicles.id", ondelete="SET NULL"), nullable=True)
    device_code: Mapped[str] = mapped_column(sa.String(64), nullable=False, unique=True)
    device_type: Mapped[str] = mapped_column(sa.String(32), nullable=False)
    api_key_hash: Mapped[str] = mapped_column(sa.String(128), nullable=False)
    status: Mapped[str] = mapped_column(sa.String(32), nullable=False, server_default=sa.text("'ACTIVE'"))
    last_seen_at: Mapped[datetime | None] = mapped_column(sa.DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now())
    revoked_at: Mapped[datetime | None] = mapped_column(sa.DateTime(timezone=True), nullable=True)


class DeviceReplayLedgerModel(Base):
    __tablename__ = "device_replay_ledgers"

    device_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), sa.ForeignKey("devices.id", ondelete="CASCADE"), primary_key=True)
    vehicle_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), sa.ForeignKey("vehicles.id", ondelete="CASCADE"), nullable=False)
    last_sequence_number: Mapped[int] = mapped_column(sa.BigInteger(), nullable=False, server_default=sa.text("0"))
    last_event_at: Mapped[datetime] = mapped_column(sa.DateTime(timezone=True), nullable=False)
    last_received_at: Mapped[datetime] = mapped_column(sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now())
    updated_at: Mapped[datetime] = mapped_column(sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now(), onupdate=sa.func.now())


class VehicleCurrentPositionModel(Base):
    __tablename__ = "vehicle_positions_current"

    vehicle_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), sa.ForeignKey("vehicles.id", ondelete="CASCADE"), primary_key=True)
    device_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), sa.ForeignKey("devices.id", ondelete="SET NULL"), nullable=True)
    active_trip_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), sa.ForeignKey("trips.id", ondelete="SET NULL"), nullable=True)
    geom = mapped_column(Geometry(geometry_type="POINT", srid=4326), nullable=False)
    event_at: Mapped[datetime] = mapped_column(sa.DateTime(timezone=True), nullable=False)
    received_at: Mapped[datetime] = mapped_column(sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now())
    speed_kph: Mapped[float] = mapped_column(sa.Float(), nullable=False, server_default=sa.text("0.0"))
    heading_deg: Mapped[float] = mapped_column(sa.Float(), nullable=False, server_default=sa.text("0.0"))
    altitude_m: Mapped[float | None] = mapped_column(sa.Float(), nullable=True)
    battery_pct: Mapped[float | None] = mapped_column(sa.Float(), nullable=True)
    fix_quality: Mapped[str] = mapped_column(sa.String(32), nullable=False, server_default=sa.text("'GPS_FIX_3D'"))
    source_type: Mapped[str] = mapped_column(sa.String(32), nullable=False)
    source_rank: Mapped[int] = mapped_column(sa.Integer(), nullable=False, server_default=sa.text("1"))
    snapped_edge_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), sa.ForeignKey("road_edges.id", ondelete="SET NULL"), nullable=True)
    is_simulated: Mapped[bool] = mapped_column(sa.Boolean(), nullable=False, server_default=sa.text("false"))
    updated_at: Mapped[datetime] = mapped_column(sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now(), onupdate=sa.func.now())


class PositionBreadcrumbModel(Base):
    __tablename__ = "position_breadcrumbs"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    vehicle_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), sa.ForeignKey("vehicles.id", ondelete="CASCADE"), nullable=False)
    device_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), sa.ForeignKey("devices.id", ondelete="SET NULL"), nullable=True)
    trip_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), sa.ForeignKey("trips.id", ondelete="SET NULL"), nullable=True)
    geom = mapped_column(Geometry(geometry_type="POINT", srid=4326), nullable=False)
    event_at: Mapped[datetime] = mapped_column(sa.DateTime(timezone=True), nullable=False)
    received_at: Mapped[datetime] = mapped_column(sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now())
    sequence_number: Mapped[int | None] = mapped_column(sa.BigInteger(), nullable=True)
    speed_kph: Mapped[float] = mapped_column(sa.Float(), nullable=False, server_default=sa.text("0.0"))
    heading_deg: Mapped[float] = mapped_column(sa.Float(), nullable=False, server_default=sa.text("0.0"))
    fix_quality: Mapped[str] = mapped_column(sa.String(32), nullable=False, server_default=sa.text("'GPS_FIX_3D'"))
    source_type: Mapped[str] = mapped_column(sa.String(32), nullable=False)
    is_anomalous_speed: Mapped[bool] = mapped_column(sa.Boolean(), nullable=False, server_default=sa.text("false"))
    is_simulated: Mapped[bool] = mapped_column(sa.Boolean(), nullable=False, server_default=sa.text("false"))
    created_at: Mapped[datetime] = mapped_column(sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now())
