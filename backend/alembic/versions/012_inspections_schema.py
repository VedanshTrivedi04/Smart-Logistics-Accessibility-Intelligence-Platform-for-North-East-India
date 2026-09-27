"""012_inspections_schema — Create inspections and inspection_media tables.

Revision ID: 012_inspections_schema
Revises: 011_report_altitude_road_side
Create Date: 2026-09-27
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "012_inspections_schema"
down_revision = "011_report_altitude_road_side"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "inspections",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("jurisdiction_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("jurisdictions.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("report_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("reports.id", ondelete="SET NULL"), nullable=True),
        sa.Column("incident_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("incidents.id", ondelete="SET NULL"), nullable=True),
        sa.Column("candidate_edge_id", sa.String(128), nullable=True),
        sa.Column("assigned_to", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("assigned_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("priority", sa.String(32), nullable=False, server_default="MEDIUM"),
        sa.Column("status", sa.String(32), nullable=False, server_default="ASSIGNED"),
        sa.Column("instructions", sa.Text(), nullable=False, server_default=""),
        sa.Column("road_condition", sa.String(128), nullable=True),
        sa.Column("passability", sa.String(64), nullable=True),
        sa.Column("damage_type", sa.String(64), nullable=True),
        sa.Column("stability", sa.String(64), nullable=True),
        sa.Column("affected_length_m", sa.Float(), nullable=True),
        sa.Column("affected_width_m", sa.Float(), nullable=True),
        sa.Column("debris_depth_m", sa.Float(), nullable=True),
        sa.Column("bridge_pier_scour_depth_m", sa.Float(), nullable=True),
        sa.Column("water_level_over_road_cm", sa.Float(), nullable=True),
        sa.Column("slope_movement_detected", sa.Boolean(), nullable=True),
        sa.Column("heavy_vehicle_passable", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("recommended_speed_limit_kmh", sa.Integer(), nullable=True),
        sa.Column("technical_notes", sa.Text(), nullable=False, server_default=""),
        sa.Column("raw_measurements", postgresql.JSONB(), nullable=False, server_default="{}"),
        sa.Column("final_decision", sa.String(64), nullable=True),
        sa.Column("decision_notes", sa.Text(), nullable=True),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )

    op.create_index("ix_inspections_jurisdiction_id", "inspections", ["jurisdiction_id"])
    op.create_index("ix_inspections_report_id", "inspections", ["report_id"])
    op.create_index("ix_inspections_incident_id", "inspections", ["incident_id"])
    op.create_index("ix_inspections_assigned_to", "inspections", ["assigned_to"])
    op.create_index("ix_inspections_status", "inspections", ["status"])
    op.create_index("ix_inspections_candidate_edge_id", "inspections", ["candidate_edge_id"])

    op.create_table(
        "inspection_media",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("inspection_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("inspections.id", ondelete="CASCADE"), nullable=False),
        sa.Column("media_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("media_objects.id", ondelete="CASCADE"), nullable=False),
        sa.Column("kind", sa.String(64), nullable=False, server_default="WIDE_ANGLE"),
        sa.Column("caption", sa.String(255), nullable=True),
        sa.Column("latitude", sa.Float(), nullable=True),
        sa.Column("longitude", sa.Float(), nullable=True),
        sa.Column("altitude_m", sa.Float(), nullable=True),
        sa.Column("azimuth_deg", sa.Float(), nullable=True),
        sa.Column("captured_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )

    op.create_index("ix_inspection_media_inspection_id", "inspection_media", ["inspection_id"])


def downgrade() -> None:
    op.drop_index("ix_inspection_media_inspection_id", table_name="inspection_media")
    op.drop_table("inspection_media")
    op.drop_index("ix_inspections_candidate_edge_id", table_name="inspections")
    op.drop_index("ix_inspections_status", table_name="inspections")
    op.drop_index("ix_inspections_assigned_to", table_name="inspections")
    op.drop_index("ix_inspections_incident_id", table_name="inspections")
    op.drop_index("ix_inspections_report_id", table_name="inspections")
    op.drop_index("ix_inspections_jurisdiction_id", table_name="inspections")
    op.drop_table("inspections")
