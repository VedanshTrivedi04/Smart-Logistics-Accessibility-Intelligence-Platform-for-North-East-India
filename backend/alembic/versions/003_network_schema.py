"""003_network_schema — Road Network Graph, Spatial PostGIS Tables & Append-Only Edge Status.

Revision ID: 003_network_schema
Revises: 002_identity_schema
Create Date: 2026-09-21
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from geoalchemy2 import Geometry
from sqlalchemy.dialects import postgresql

revision = "003_network_schema"
down_revision = "002_identity_schema"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 1. network_versions
    op.create_table(
        "network_versions",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("code", sa.String(64), unique=True, nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("status", sa.String(32), nullable=False, server_default=sa.text("'ACTIVE'")),
        sa.Column("built_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("metadata", postgresql.JSONB(), nullable=False, server_default=sa.text("'{}'::jsonb")),
    )
    op.create_index("ix_network_versions_code", "network_versions", ["code"])

    # 2. road_nodes
    op.create_table(
        "road_nodes",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("network_version_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("network_versions.id", ondelete="CASCADE"), nullable=False),
        sa.Column("node_index", sa.BigInteger(), nullable=False),
        sa.Column("geom", Geometry(geometry_type="POINT", srid=4326), nullable=False),
        sa.Column("elevation_m", sa.Float(), nullable=True),
        sa.Column("jurisdiction_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("jurisdictions.id", ondelete="SET NULL"), nullable=True),
        sa.UniqueConstraint("network_version_id", "node_index", name="uq_road_nodes_version_index"),
    )
    op.create_index("ix_road_nodes_version_id", "road_nodes", ["network_version_id"])
    op.create_index("ix_road_nodes_geom", "road_nodes", ["geom"], postgresql_using="gist")

    # 3. road_edges
    op.create_table(
        "road_edges",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("network_version_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("network_versions.id", ondelete="CASCADE"), nullable=False),
        sa.Column("edge_index", sa.BigInteger(), nullable=False),
        sa.Column("source_node_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("road_nodes.id", ondelete="CASCADE"), nullable=False),
        sa.Column("target_node_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("road_nodes.id", ondelete="CASCADE"), nullable=False),
        sa.Column("source_index", sa.BigInteger(), nullable=False),
        sa.Column("target_index", sa.BigInteger(), nullable=False),
        sa.Column("geom", Geometry(geometry_type="LINESTRING", srid=4326), nullable=False),
        sa.Column("length_meters", sa.Float(), nullable=False),
        sa.Column("road_class", sa.String(32), nullable=False),
        sa.Column("road_name", sa.String(128), nullable=True),
        sa.Column("surface_type", sa.String(32), nullable=False),
        sa.Column("speed_limit_kmh", sa.Integer(), nullable=False),
        sa.Column("base_seconds", sa.Float(), nullable=False),
        sa.Column("reverse_base_seconds", sa.Float(), nullable=False),
        sa.Column("elevation_gain_m", sa.Float(), nullable=False, server_default=sa.text("0.0")),
        sa.Column("gradient_percent", sa.Float(), nullable=False, server_default=sa.text("0.0")),
        sa.Column("is_bridge", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("jurisdiction_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("jurisdictions.id", ondelete="SET NULL"), nullable=True),
        sa.UniqueConstraint("network_version_id", "edge_index", name="uq_road_edges_version_index"),
    )
    op.create_index("ix_road_edges_version_id", "road_edges", ["network_version_id"])
    op.create_index("ix_road_edges_source_target_index", "road_edges", ["source_index", "target_index"])
    op.create_index("ix_road_edges_geom", "road_edges", ["geom"], postgresql_using="gist")

    # 4. bridges
    op.create_table(
        "bridges",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("code", sa.String(64), unique=True, nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("geom", Geometry(geometry_type="GEOMETRY", srid=4326), nullable=True),
        sa.Column("length_meters", sa.Float(), nullable=False),
        sa.Column("max_weight_tonnes", sa.Float(), nullable=True),
        sa.Column("max_height_meters", sa.Float(), nullable=True),
        sa.Column("max_axle_load_tonnes", sa.Float(), nullable=True),
        sa.Column("is_single_lane", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("structural_condition", sa.String(32), nullable=False, server_default=sa.text("'GOOD'")),
        sa.Column("last_inspection_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("jurisdiction_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("jurisdictions.id", ondelete="RESTRICT"), nullable=False),
    )
    op.create_index("ix_bridges_code", "bridges", ["code"])

    # 5. bridge_edges
    op.create_table(
        "bridge_edges",
        sa.Column("bridge_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("bridges.id", ondelete="CASCADE"), nullable=False),
        sa.Column("edge_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("road_edges.id", ondelete="CASCADE"), nullable=False),
        sa.PrimaryKeyConstraint("bridge_id", "edge_id", name="pk_bridge_edges"),
    )
    op.create_index("ix_bridge_edges_edge_id", "bridge_edges", ["edge_id"])

    # 6. edge_restrictions
    op.create_table(
        "edge_restrictions",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("edge_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("road_edges.id", ondelete="CASCADE"), nullable=False),
        sa.Column("kind", sa.String(32), nullable=False),
        sa.Column("value_numeric", sa.Float(), nullable=True),
        sa.Column("unit", sa.String(16), nullable=True),
        sa.Column("direction", sa.String(16), nullable=False, server_default=sa.text("'BOTH'")),
        sa.Column("valid_from", sa.DateTime(timezone=True), nullable=True),
        sa.Column("valid_until", sa.DateTime(timezone=True), nullable=True),
        sa.Column("source_reference", sa.String(255), nullable=True),
    )
    op.create_index("ix_edge_restrictions_edge_id", "edge_restrictions", ["edge_id"])

    # 7. facilities
    op.create_table(
        "facilities",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("code", sa.String(64), unique=True, nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("kind", sa.String(32), nullable=False),
        sa.Column("jurisdiction_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("jurisdictions.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("geom", Geometry(geometry_type="POINT", srid=4326), nullable=False),
        sa.Column("nearest_road_node_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("road_nodes.id", ondelete="SET NULL"), nullable=True),
        sa.Column("snap_distance_m", sa.Float(), nullable=True),
        sa.Column("is_critical", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_facilities_code", "facilities", ["code"])
    op.create_index("ix_facilities_kind", "facilities", ["kind"])
    op.create_index("ix_facilities_jurisdiction_id", "facilities", ["jurisdiction_id"])
    op.create_index("ix_facilities_geom", "facilities", ["geom"], postgresql_using="gist")

    # 8. edge_status_events (Append-only)
    op.create_table(
        "edge_status_events",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("edge_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("road_edges.id", ondelete="CASCADE"), nullable=False),
        sa.Column("status", sa.String(32), nullable=False),
        sa.Column("restrictions", postgresql.JSONB(), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("reason", sa.Text(), nullable=False),
        sa.Column("source_event_type", sa.String(32), nullable=False),
        sa.Column("source_reference_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("actor_user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("valid_from", sa.DateTime(timezone=True), nullable=False),
        sa.Column("valid_until", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_edge_status_events_edge_id", "edge_status_events", ["edge_id"])
    op.create_index("ix_edge_status_events_created_at", "edge_status_events", ["created_at"])

    # Trigger: prevent UPDATE or DELETE on edge_status_events
    op.execute("""
        CREATE OR REPLACE FUNCTION prevent_edge_status_events_mutation()
        RETURNS TRIGGER AS $$
        BEGIN
            RAISE EXCEPTION 'edge_status_events is append-only: updates and deletes are strictly prohibited';
        END;
        $$ LANGUAGE plpgsql;
    """)

    op.execute("""
        CREATE TRIGGER trg_prevent_edge_status_events_mutation
        BEFORE UPDATE OR DELETE ON edge_status_events
        FOR EACH ROW EXECUTE FUNCTION prevent_edge_status_events_mutation();
    """)

    # 9. edge_status_current (Rebuildable Projection)
    op.create_table(
        "edge_status_current",
        sa.Column("edge_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("road_edges.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("status_version", sa.BigInteger(), nullable=False, server_default=sa.text("1")),
        sa.Column("status", sa.String(32), nullable=False, server_default=sa.text("'OPEN'")),
        sa.Column("freshness", sa.String(32), nullable=False, server_default=sa.text("'FRESH'")),
        sa.Column("effective_restrictions", postgresql.JSONB(), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("source_event_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("edge_status_events.id", ondelete="SET NULL"), nullable=True),
        sa.Column("last_verified_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_edge_status_current_status", "edge_status_current", ["status"])


def downgrade() -> None:
    op.execute("DROP TRIGGER IF EXISTS trg_prevent_edge_status_events_mutation ON edge_status_events;")
    op.execute("DROP FUNCTION IF EXISTS prevent_edge_status_events_mutation();")

    op.drop_table("edge_status_current")
    op.drop_table("edge_status_events")
    op.drop_table("facilities")
    op.drop_table("edge_restrictions")
    op.drop_table("bridge_edges")
    op.drop_table("bridges")
    op.drop_table("road_edges")
    op.drop_table("road_nodes")
    op.drop_table("network_versions")
