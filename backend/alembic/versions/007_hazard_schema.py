"""007_hazard_schema — Landslide Risk Zones, Rainfall Observations & Risk Assessments.

Revision ID: 007_hazard_schema
Revises: 006_routing_impact_schema
Create Date: 2026-09-23
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from geoalchemy2 import Geometry
from sqlalchemy.dialects import postgresql

revision = "007_hazard_schema"
down_revision = "006_routing_impact_schema"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 1. risk_zones
    op.create_table(
        "risk_zones",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("jurisdiction_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("jurisdictions.id", ondelete="SET NULL"), nullable=True),
        sa.Column("source", sa.String(32), nullable=False, server_default=sa.text("'TERRAIN_DERIVED'")),
        sa.Column("gradient_percent", sa.Float(), nullable=False, server_default=sa.text("0.0")),
        sa.Column("geom", Geometry(geometry_type="POLYGON", srid=4326), nullable=False),
        sa.Column("centroid_geom", Geometry(geometry_type="POINT", srid=4326), nullable=False),
        sa.Column("related_edge_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("road_edges.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_risk_zones_jurisdiction_id", "risk_zones", ["jurisdiction_id"])
    op.create_index("ix_risk_zones_related_edge_id", "risk_zones", ["related_edge_id"])
    op.create_index("ix_risk_zones_geom", "risk_zones", ["geom"], postgresql_using="gist")
    op.create_index("ix_risk_zones_centroid_geom", "risk_zones", ["centroid_geom"], postgresql_using="gist")

    # 2. rainfall_observations
    op.create_table(
        "rainfall_observations",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("risk_zone_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("risk_zones.id", ondelete="CASCADE"), nullable=False),
        sa.Column("rainfall_mm_1h", sa.Float(), nullable=False, server_default=sa.text("0.0")),
        sa.Column("rainfall_mm_24h", sa.Float(), nullable=False, server_default=sa.text("0.0")),
        sa.Column("rainfall_mm_72h", sa.Float(), nullable=False, server_default=sa.text("0.0")),
        sa.Column("observed_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("source", sa.String(64), nullable=False, server_default=sa.text("'open-meteo'")),
    )
    op.create_index(
        "ix_rainfall_observations_zone_observed",
        "rainfall_observations",
        ["risk_zone_id", "observed_at"],
    )

    # 3. risk_assessments
    op.create_table(
        "risk_assessments",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("risk_zone_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("risk_zones.id", ondelete="CASCADE"), nullable=False),
        sa.Column("risk_level", sa.String(16), nullable=False, server_default=sa.text("'LOW'")),
        sa.Column("risk_score", sa.Float(), nullable=False, server_default=sa.text("0.0")),
        sa.Column("rainfall_mm_24h", sa.Float(), nullable=False, server_default=sa.text("0.0")),
        sa.Column("rainfall_mm_72h", sa.Float(), nullable=False, server_default=sa.text("0.0")),
        sa.Column("contributing_factors", postgresql.JSONB(), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("computed_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index(
        "ix_risk_assessments_zone_computed",
        "risk_assessments",
        ["risk_zone_id", "computed_at"],
    )


def downgrade() -> None:
    op.drop_table("risk_assessments")
    op.drop_table("rainfall_observations")
    op.drop_table("risk_zones")
