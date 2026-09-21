"""
app/modules/logistics/infrastructure/models.py — SQLAlchemy declarative models for Logistics.
"""

from __future__ import annotations

import uuid
from datetime import datetime

from geoalchemy2 import Geometry
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import ARRAY, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.db import Base


class VehicleModel(Base):
    __tablename__ = "vehicles"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False)
    registration_number: Mapped[str] = mapped_column(sa.String(32), nullable=False)
    vehicle_type: Mapped[str] = mapped_column(sa.String(32), nullable=False)
    make_model: Mapped[str] = mapped_column(sa.String(128), nullable=False)
    max_weight_kg: Mapped[float] = mapped_column(sa.Float(), nullable=False)
    empty_weight_kg: Mapped[float] = mapped_column(sa.Float(), nullable=False)
    height_m: Mapped[float] = mapped_column(sa.Float(), nullable=False)
    width_m: Mapped[float] = mapped_column(sa.Float(), nullable=False)
    length_m: Mapped[float] = mapped_column(sa.Float(), nullable=False)
    axle_count: Mapped[int] = mapped_column(sa.Integer(), nullable=False)
    is_hazmat_capable: Mapped[bool] = mapped_column(sa.Boolean(), nullable=False, server_default=sa.text("false"))
    is_refrigerated: Mapped[bool] = mapped_column(sa.Boolean(), nullable=False, server_default=sa.text("false"))
    is_active: Mapped[bool] = mapped_column(sa.Boolean(), nullable=False, server_default=sa.text("true"))
    created_at: Mapped[datetime] = mapped_column(sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now())
    updated_at: Mapped[datetime] = mapped_column(sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now(), onupdate=sa.func.now())


class DriverModel(Base):
    __tablename__ = "drivers"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False)
    user_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    full_name: Mapped[str] = mapped_column(sa.String(128), nullable=False)
    phone_e164: Mapped[str] = mapped_column(sa.String(32), nullable=False)
    license_number: Mapped[str] = mapped_column(sa.String(64), nullable=False)
    license_classes: Mapped[list[str]] = mapped_column(ARRAY(sa.String), nullable=False, server_default=sa.text("'{}'"))
    is_active: Mapped[bool] = mapped_column(sa.Boolean(), nullable=False, server_default=sa.text("true"))
    created_at: Mapped[datetime] = mapped_column(sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now())
    updated_at: Mapped[datetime] = mapped_column(sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now(), onupdate=sa.func.now())


class DeliveryCommitmentModel(Base):
    __tablename__ = "delivery_commitments"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False)
    consignment_reference: Mapped[str] = mapped_column(sa.String(64), nullable=False, unique=True)
    cargo_category: Mapped[str] = mapped_column(sa.String(32), nullable=False)
    priority_tier: Mapped[str] = mapped_column(sa.String(32), nullable=False)
    consigned_weight_kg: Mapped[float] = mapped_column(sa.Float(), nullable=False)
    consigned_volume_m3: Mapped[float | None] = mapped_column(sa.Float(), nullable=True)
    consigned_quantity_units: Mapped[int] = mapped_column(sa.Integer(), nullable=False)
    delivered_quantity_units: Mapped[int] = mapped_column(sa.Integer(), nullable=False, server_default=sa.text("0"))
    origin_facility_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), sa.ForeignKey("facilities.id", ondelete="RESTRICT"), nullable=False)
    destination_facility_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), sa.ForeignKey("facilities.id", ondelete="RESTRICT"), nullable=False)
    required_before: Mapped[datetime] = mapped_column(sa.DateTime(timezone=True), nullable=False)
    status: Mapped[str] = mapped_column(sa.String(32), nullable=False, server_default=sa.text("'PENDING'"))
    shortage_reason: Mapped[str | None] = mapped_column(sa.String(128), nullable=True)
    created_at: Mapped[datetime] = mapped_column(sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now())
    updated_at: Mapped[datetime] = mapped_column(sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now(), onupdate=sa.func.now())


class TripModel(Base):
    __tablename__ = "trips"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False)
    vehicle_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), sa.ForeignKey("vehicles.id", ondelete="RESTRICT"), nullable=False)
    driver_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), sa.ForeignKey("drivers.id", ondelete="RESTRICT"), nullable=False)
    trip_code: Mapped[str] = mapped_column(sa.String(64), nullable=False, unique=True)
    status: Mapped[str] = mapped_column(sa.String(32), nullable=False, server_default=sa.text("'PLANNED'"))
    current_route_snapshot_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
    scheduled_departure: Mapped[datetime] = mapped_column(sa.DateTime(timezone=True), nullable=False)
    actual_departure: Mapped[datetime | None] = mapped_column(sa.DateTime(timezone=True), nullable=True)
    actual_arrival: Mapped[datetime | None] = mapped_column(sa.DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now())
    updated_at: Mapped[datetime] = mapped_column(sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now(), onupdate=sa.func.now())

    stops: Mapped[list[TripStopModel]] = relationship("TripStopModel", back_populates="trip", cascade="all, delete-orphan", order_by="TripStopModel.sequence_order")
    commitments: Mapped[list[TripCommitmentModel]] = relationship("TripCommitmentModel", back_populates="trip", cascade="all, delete-orphan")


class TripStopModel(Base):
    __tablename__ = "trip_stops"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    trip_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), sa.ForeignKey("trips.id", ondelete="CASCADE"), nullable=False)
    sequence_order: Mapped[int] = mapped_column(sa.Integer(), nullable=False)
    stop_type: Mapped[str] = mapped_column(sa.String(32), nullable=False)
    facility_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), sa.ForeignKey("facilities.id", ondelete="SET NULL"), nullable=True)
    geom = mapped_column(Geometry(geometry_type="POINT", srid=4326), nullable=False)
    planned_arrival: Mapped[datetime] = mapped_column(sa.DateTime(timezone=True), nullable=False)
    planned_departure: Mapped[datetime] = mapped_column(sa.DateTime(timezone=True), nullable=False)
    actual_arrival: Mapped[datetime | None] = mapped_column(sa.DateTime(timezone=True), nullable=True)
    actual_departure: Mapped[datetime | None] = mapped_column(sa.DateTime(timezone=True), nullable=True)
    status: Mapped[str] = mapped_column(sa.String(32), nullable=False, server_default=sa.text("'PENDING'"))

    trip: Mapped[TripModel] = relationship("TripModel", back_populates="stops")


class TripCommitmentModel(Base):
    __tablename__ = "trip_commitments"

    trip_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), sa.ForeignKey("trips.id", ondelete="CASCADE"), primary_key=True)
    commitment_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), sa.ForeignKey("delivery_commitments.id", ondelete="CASCADE"), primary_key=True)
    loaded_at: Mapped[datetime | None] = mapped_column(sa.DateTime(timezone=True), nullable=True)

    trip: Mapped[TripModel] = relationship("TripModel", back_populates="commitments")
