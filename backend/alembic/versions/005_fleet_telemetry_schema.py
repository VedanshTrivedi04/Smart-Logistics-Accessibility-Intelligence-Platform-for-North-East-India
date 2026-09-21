"""005_fleet_telemetry_schema — Fleet Logistics, Delivery Commitments & Authenticated Telemetry Tracking.

Revision ID: 005_fleet_telemetry_schema
Revises: 004_reporting_incident_schema
Create Date: 2026-09-21
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from geoalchemy2 import Geometry
from sqlalchemy.dialects import postgresql

revision = "005_fleet_telemetry_schema"
down_revision = "004_reporting_incident_schema"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 1. vehicles
    op.create_table(
        "vehicles",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False),
        sa.Column("registration_number", sa.String(32), nullable=False),
        sa.Column("vehicle_type", sa.String(32), nullable=False),
        sa.Column("make_model", sa.String(128), nullable=False),
        sa.Column("max_weight_kg", sa.Float(), nullable=False),
        sa.Column("empty_weight_kg", sa.Float(), nullable=False),
        sa.Column("height_m", sa.Float(), nullable=False),
        sa.Column("width_m", sa.Float(), nullable=False),
        sa.Column("length_m", sa.Float(), nullable=False),
        sa.Column("axle_count", sa.Integer(), nullable=False),
        sa.Column("is_hazmat_capable", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("is_refrigerated", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("organization_id", "registration_number", name="uq_vehicles_org_reg"),
    )
    op.create_index("ix_vehicles_organization_id", "vehicles", ["organization_id"])
    op.create_index("ix_vehicles_is_active", "vehicles", ["is_active"])

    # 2. drivers
    op.create_table(
        "drivers",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("full_name", sa.String(128), nullable=False),
        sa.Column("phone_e164", sa.String(32), nullable=False),
        sa.Column("license_number", sa.String(64), nullable=False),
        sa.Column("license_classes", postgresql.ARRAY(sa.String), nullable=False, server_default=sa.text("'{}'")),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_drivers_organization_id", "drivers", ["organization_id"])
    op.create_index("ix_drivers_user_id", "drivers", ["user_id"])

    # 3. devices
    op.create_table(
        "devices",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False),
        sa.Column("vehicle_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("vehicles.id", ondelete="SET NULL"), nullable=True),
        sa.Column("device_code", sa.String(64), nullable=False, unique=True),
        sa.Column("device_type", sa.String(32), nullable=False),
        sa.Column("api_key_hash", sa.String(128), nullable=False),
        sa.Column("status", sa.String(32), nullable=False, server_default=sa.text("'ACTIVE'")),
        sa.Column("last_seen_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_devices_organization_id", "devices", ["organization_id"])
    op.create_index("ix_devices_vehicle_id", "devices", ["vehicle_id"])
    op.create_index("ix_devices_api_key_hash", "devices", ["api_key_hash"])
    op.create_index("ix_devices_status", "devices", ["status"])

    # 4. delivery_commitments
    op.create_table(
        "delivery_commitments",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False),
        sa.Column("consignment_reference", sa.String(64), nullable=False, unique=True),
        sa.Column("cargo_category", sa.String(32), nullable=False),
        sa.Column("priority_tier", sa.String(32), nullable=False),
        sa.Column("consigned_weight_kg", sa.Float(), nullable=False),
        sa.Column("consigned_volume_m3", sa.Float(), nullable=True),
        sa.Column("consigned_quantity_units", sa.Integer(), nullable=False),
        sa.Column("delivered_quantity_units", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.Column("origin_facility_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("facilities.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("destination_facility_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("facilities.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("required_before", sa.DateTime(timezone=True), nullable=False),
        sa.Column("status", sa.String(32), nullable=False, server_default=sa.text("'PENDING'")),
        sa.Column("shortage_reason", sa.String(128), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_delivery_commitments_organization_id", "delivery_commitments", ["organization_id"])
    op.create_index("ix_delivery_commitments_status", "delivery_commitments", ["status"])
    op.create_index("ix_delivery_commitments_required_before", "delivery_commitments", ["required_before"])
    op.create_index("ix_delivery_commitments_destination_facility_id", "delivery_commitments", ["destination_facility_id"])

    # 5. trips
    op.create_table(
        "trips",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False),
        sa.Column("vehicle_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("vehicles.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("driver_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("drivers.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("trip_code", sa.String(64), nullable=False, unique=True),
        sa.Column("status", sa.String(32), nullable=False, server_default=sa.text("'PLANNED'")),
        sa.Column("current_route_snapshot_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("scheduled_departure", sa.DateTime(timezone=True), nullable=False),
        sa.Column("actual_departure", sa.DateTime(timezone=True), nullable=True),
        sa.Column("actual_arrival", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_trips_organization_id", "trips", ["organization_id"])
    op.create_index("ix_trips_vehicle_id", "trips", ["vehicle_id"])
    op.create_index("ix_trips_driver_id", "trips", ["driver_id"])
    op.create_index("ix_trips_status", "trips", ["status"])

    # 6. trip_stops
    op.create_table(
        "trip_stops",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("trip_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("trips.id", ondelete="CASCADE"), nullable=False),
        sa.Column("sequence_order", sa.Integer(), nullable=False),
        sa.Column("stop_type", sa.String(32), nullable=False),
        sa.Column("facility_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("facilities.id", ondelete="SET NULL"), nullable=True),
        sa.Column("geom", Geometry(geometry_type="POINT", srid=4326), nullable=False),
        sa.Column("planned_arrival", sa.DateTime(timezone=True), nullable=False),
        sa.Column("planned_departure", sa.DateTime(timezone=True), nullable=False),
        sa.Column("actual_arrival", sa.DateTime(timezone=True), nullable=True),
        sa.Column("actual_departure", sa.DateTime(timezone=True), nullable=True),
        sa.Column("status", sa.String(32), nullable=False, server_default=sa.text("'PENDING'")),
        sa.UniqueConstraint("trip_id", "sequence_order", name="uq_trip_stops_seq"),
    )
    op.create_index("ix_trip_stops_trip_id", "trip_stops", ["trip_id"])

    # 7. trip_commitments
    op.create_table(
        "trip_commitments",
        sa.Column("trip_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("trips.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("commitment_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("delivery_commitments.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("loaded_at", sa.DateTime(timezone=True), nullable=True),
    )

    # 8. device_replay_ledgers
    op.create_table(
        "device_replay_ledgers",
        sa.Column("device_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("devices.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("vehicle_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("vehicles.id", ondelete="CASCADE"), nullable=False),
        sa.Column("last_sequence_number", sa.BigInteger(), nullable=False, server_default=sa.text("0")),
        sa.Column("last_event_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("last_received_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_device_replay_ledgers_vehicle_id", "device_replay_ledgers", ["vehicle_id"])

    # 9. vehicle_positions_current
    op.create_table(
        "vehicle_positions_current",
        sa.Column("vehicle_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("vehicles.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("device_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("devices.id", ondelete="SET NULL"), nullable=True),
        sa.Column("active_trip_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("trips.id", ondelete="SET NULL"), nullable=True),
        sa.Column("geom", Geometry(geometry_type="POINT", srid=4326), nullable=False),
        sa.Column("event_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("received_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("speed_kph", sa.Float(), nullable=False, server_default=sa.text("0.0")),
        sa.Column("heading_deg", sa.Float(), nullable=False, server_default=sa.text("0.0")),
        sa.Column("altitude_m", sa.Float(), nullable=True),
        sa.Column("battery_pct", sa.Float(), nullable=True),
        sa.Column("fix_quality", sa.String(32), nullable=False, server_default=sa.text("'GPS_FIX_3D'")),
        sa.Column("source_type", sa.String(32), nullable=False),
        sa.Column("source_rank", sa.Integer(), nullable=False, server_default=sa.text("1")),
        sa.Column("snapped_edge_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("road_edges.id", ondelete="SET NULL"), nullable=True),
        sa.Column("is_simulated", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_vehicle_positions_current_event_at", "vehicle_positions_current", ["event_at"])
    op.create_index("ix_vehicle_positions_current_active_trip_id", "vehicle_positions_current", ["active_trip_id"])
    op.create_index("ix_vehicle_positions_current_snapped_edge_id", "vehicle_positions_current", ["snapped_edge_id"])

    # 10. position_breadcrumbs
    op.create_table(
        "position_breadcrumbs",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("vehicle_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("vehicles.id", ondelete="CASCADE"), nullable=False),
        sa.Column("device_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("devices.id", ondelete="SET NULL"), nullable=True),
        sa.Column("trip_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("trips.id", ondelete="SET NULL"), nullable=True),
        sa.Column("geom", Geometry(geometry_type="POINT", srid=4326), nullable=False),
        sa.Column("event_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("received_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("sequence_number", sa.BigInteger(), nullable=True),
        sa.Column("speed_kph", sa.Float(), nullable=False, server_default=sa.text("0.0")),
        sa.Column("heading_deg", sa.Float(), nullable=False, server_default=sa.text("0.0")),
        sa.Column("fix_quality", sa.String(32), nullable=False, server_default=sa.text("'GPS_FIX_3D'")),
        sa.Column("source_type", sa.String(32), nullable=False),
        sa.Column("is_anomalous_speed", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("is_simulated", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_position_breadcrumbs_vehicle_event_at", "position_breadcrumbs", ["vehicle_id", "event_at"])
    op.create_index("ix_position_breadcrumbs_trip_event_at", "position_breadcrumbs", ["trip_id", "event_at"])
    op.create_index("ix_position_breadcrumbs_created_at", "position_breadcrumbs", ["created_at"])


def downgrade() -> None:
    op.drop_table("position_breadcrumbs")
    op.drop_table("vehicle_positions_current")
    op.drop_table("device_replay_ledgers")
    op.drop_table("trip_commitments")
    op.drop_table("trip_stops")
    op.drop_table("trips")
    op.drop_table("delivery_commitments")
    op.drop_table("devices")
    op.drop_table("drivers")
    op.drop_table("vehicles")
