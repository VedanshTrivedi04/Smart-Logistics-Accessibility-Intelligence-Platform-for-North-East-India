"""006_routing_impact_schema — Constrained Routing Engine & Disruption Impact Evaluator.

Revision ID: 006_routing_impact_schema
Revises: 005_fleet_telemetry_schema
Create Date: 2026-09-21
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from geoalchemy2 import Geometry
from sqlalchemy.dialects import postgresql

revision = "006_routing_impact_schema"
down_revision = "005_fleet_telemetry_schema"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 0. Alter existing tables for global status version and outbox resilience
    op.add_column(
        "network_versions",
        sa.Column("status_version", sa.Integer(), nullable=False, server_default=sa.text("1")),
    )
    op.add_column(
        "outbox_events",
        sa.Column("next_attempt_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "outbox_events",
        sa.Column("dead_lettered_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "outbox_consumer_receipts",
        sa.Column("status", sa.String(32), nullable=False, server_default=sa.text("'SUCCESS'")),
    )
    op.add_column(
        "outbox_consumer_receipts",
        sa.Column("error_message", sa.Text(), nullable=True),
    )

    # 1. route_plans
    op.create_table(
        "route_plans",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False),
        sa.Column("trip_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("trips.id", ondelete="SET NULL"), nullable=True),
        sa.Column("network_version_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("network_versions.id"), nullable=False),
        sa.Column("graph_version", sa.String(64), nullable=False),
        sa.Column("status_version", sa.Integer(), nullable=False),
        sa.Column("policy_version", sa.String(32), nullable=False, server_default=sa.text("'CONSERVATIVE_CRITICAL_V1'")),
        sa.Column("origin_node_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("road_nodes.id"), nullable=False),
        sa.Column("destination_node_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("road_nodes.id"), nullable=False),
        sa.Column("result_status", sa.String(32), nullable=False),
        sa.Column("total_distance_meters", sa.Integer(), nullable=False),
        sa.Column("total_duration_seconds", sa.Integer(), nullable=False),
        sa.Column("risk_penalty_score", sa.Numeric(8, 2), nullable=False, server_default=sa.text("0.0")),
        sa.Column("requires_human_review", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("excluded_edge_reasons", postgresql.JSONB(), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("primary_geometry", Geometry(geometry_type="LINESTRING", srid=4326), nullable=True),
        sa.Column("alternative_geometries", postgresql.JSONB(), nullable=False, server_default=sa.text("'[]'::jsonb")),
        # Vehicle Constraints Snapshot
        sa.Column("vehicle_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("vehicles.id", ondelete="SET NULL"), nullable=True),
        sa.Column("vehicle_weight_kg", sa.Numeric(10, 2), nullable=False),
        sa.Column("vehicle_height_m", sa.Numeric(4, 2), nullable=False),
        sa.Column("is_hazmat", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("cargo_priority", sa.String(32), nullable=False, server_default=sa.text("'TIER_3_STANDARD'")),
        sa.Column("departure_time", sa.DateTime(timezone=True), nullable=False),
        sa.Column("evaluated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_route_plans_org_id", "route_plans", ["organization_id"])
    op.create_index("ix_route_plans_trip_id", "route_plans", ["trip_id"])
    op.create_index("ix_route_plans_status_version", "route_plans", ["status_version"])
    op.create_index("ix_route_plans_geom", "route_plans", ["primary_geometry"], postgresql_using="gist")

    # 2. route_plan_edges
    op.create_table(
        "route_plan_edges",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("route_plan_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("route_plans.id", ondelete="CASCADE"), nullable=False),
        sa.Column("edge_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("road_edges.id"), nullable=False),
        sa.Column("sequence_order", sa.Integer(), nullable=False),
        sa.Column("cumulative_distance_meters", sa.Integer(), nullable=False),
        sa.Column("cumulative_duration_seconds", sa.Integer(), nullable=False),
        sa.Column("is_alternative", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("alternative_rank", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.UniqueConstraint("route_plan_id", "is_alternative", "alternative_rank", "sequence_order", name="uq_route_edge_sequence"),
        sa.CheckConstraint("sequence_order >= 0", name="ck_sequence_order_positive"),
        sa.CheckConstraint("alternative_rank >= 0", name="ck_alternative_rank_positive"),
    )
    op.create_index("ix_route_plan_edges_route_id", "route_plan_edges", ["route_plan_id"])
    op.create_index("ix_route_plan_edges_edge_id", "route_plan_edges", ["edge_id"])

    # 3. dispatch_decisions
    op.create_table(
        "dispatch_decisions",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("trip_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("trips.id", ondelete="CASCADE"), nullable=False),
        sa.Column("route_plan_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("route_plans.id"), nullable=False),
        sa.Column("actor_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("action", sa.String(32), nullable=False),
        sa.Column("selected_alternative_rank", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.Column("reason", sa.Text(), nullable=False),
        sa.Column("status_version_at_decision", sa.Integer(), nullable=False),
        sa.Column("decided_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_dispatch_decisions_trip_id", "dispatch_decisions", ["trip_id"])

    # 4. trip_impact_assessments
    op.create_table(
        "trip_impact_assessments",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("trip_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("trips.id", ondelete="CASCADE"), nullable=False),
        sa.Column("incident_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("incidents.id", ondelete="SET NULL"), nullable=True),
        sa.Column("edge_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("road_edges.id"), nullable=False),
        sa.Column("source_event_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("source_status_version", sa.Integer(), nullable=False),
        sa.Column("assessment_version", sa.Integer(), nullable=False, server_default=sa.text("1")),
        sa.Column("impact_type", sa.String(32), nullable=False),
        sa.Column("severity", sa.String(32), nullable=False),
        sa.Column("delay_estimated_seconds", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.Column("distance_to_disruption_meters", sa.Integer(), nullable=True),
        sa.Column("recommended_action", sa.String(64), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("resolved_reason", sa.String(64), nullable=True),
        sa.Column("assessed_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_trip_impacts_trip_id", "trip_impact_assessments", ["trip_id"])
    op.create_index("ix_trip_impacts_edge_id", "trip_impact_assessments", ["edge_id"])
    op.create_index("ix_trip_impacts_is_active", "trip_impact_assessments", ["is_active"])

    # 5. commitment_impact_assessments
    op.create_table(
        "commitment_impact_assessments",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("delivery_commitment_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("delivery_commitments.id", ondelete="CASCADE"), nullable=False),
        sa.Column("trip_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("trips.id"), nullable=False),
        sa.Column("trip_impact_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("trip_impact_assessments.id", ondelete="CASCADE"), nullable=False),
        sa.Column("original_required_before", sa.DateTime(timezone=True), nullable=False),
        sa.Column("projected_arrival", sa.DateTime(timezone=True), nullable=False),
        sa.Column("projected_sla_status", sa.String(32), nullable=False),
        sa.Column("delay_seconds", sa.Integer(), nullable=False),
        sa.Column("assessed_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_commitment_impacts_commitment_id", "commitment_impact_assessments", ["delivery_commitment_id"])

    # 6. facility_reachability_impacts
    op.create_table(
        "facility_reachability_impacts",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("facility_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("facilities.id", ondelete="CASCADE"), nullable=False),
        sa.Column("incident_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("incidents.id", ondelete="SET NULL"), nullable=True),
        sa.Column("edge_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("road_edges.id"), nullable=False),
        sa.Column("source_status_version", sa.Integer(), nullable=False),
        sa.Column("reachability_state", sa.String(32), nullable=False),
        sa.Column("isolated", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("alternate_route_available", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("access_delay_seconds", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.Column("assessed_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_facility_impacts_facility_id", "facility_reachability_impacts", ["facility_id"])


def downgrade() -> None:
    op.drop_table("facility_reachability_impacts")
    op.drop_table("commitment_impact_assessments")
    op.drop_table("trip_impact_assessments")
    op.drop_table("dispatch_decisions")
    op.drop_table("route_plan_edges")
    op.drop_table("route_plans")
    op.drop_column("outbox_consumer_receipts", "error_message")
    op.drop_column("outbox_consumer_receipts", "status")
    op.drop_column("outbox_events", "dead_lettered_at")
    op.drop_column("outbox_events", "next_attempt_at")
    op.drop_column("network_versions", "status_version")
