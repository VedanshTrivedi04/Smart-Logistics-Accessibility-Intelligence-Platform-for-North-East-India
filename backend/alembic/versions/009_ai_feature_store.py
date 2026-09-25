"""009_ai_feature_store — AI/ML Terrain, Weather Feature Store & Landslide Catalog.

Revision ID: 009_ai_feature_store
Revises: 008_coordination_schema
Create Date: 2026-09-22
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "009_ai_feature_store"
down_revision = "008_coordination_schema"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 1. edge_terrain_features — static topographical features (computed once from DEM)
    op.create_table(
        "edge_terrain_features",
        sa.Column(
            "edge_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("road_edges.id", ondelete="CASCADE"),
            primary_key=True,
        ),
        sa.Column("elevation_min_m", sa.Float(), nullable=False),
        sa.Column("elevation_max_m", sa.Float(), nullable=False),
        sa.Column("elevation_mean_m", sa.Float(), nullable=False),
        sa.Column("slope_pct", sa.Float(), nullable=False),
        sa.Column("aspect_deg", sa.Float(), nullable=False),
        sa.Column("curvature_index", sa.Float(), nullable=False),
        sa.Column("susceptibility_zone", sa.String(16), nullable=False),
        sa.Column("distance_to_stream_m", sa.Float(), nullable=False),
        sa.Column(
            "computed_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
    )

    # 2. edge_weather_features — dynamic rainfall/ARI time series
    op.create_table(
        "edge_weather_features",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "edge_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("road_edges.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("observed_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("rainfall_24h_mm", sa.Float(), nullable=False),
        sa.Column("rainfall_48h_mm", sa.Float(), nullable=False),
        sa.Column("rainfall_72h_mm", sa.Float(), nullable=False),
        sa.Column("ari_score", sa.Float(), nullable=False),
        sa.Column("forecast_rainfall_3h_mm", sa.Float(), nullable=False),
        sa.Column("forecast_rainfall_6h_mm", sa.Float(), nullable=False),
        sa.Column("forecast_rainfall_12h_mm", sa.Float(), nullable=False),
        sa.Column("soil_moisture_index", sa.Float(), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.UniqueConstraint(
            "edge_id", "observed_at", name="uq_edge_weather_features_edge_observed"
        ),
    )
    op.create_index(
        "ix_edge_weather_features_edge_observed",
        "edge_weather_features",
        ["edge_id", "observed_at"],
    )

    # 3. landslide_events — historical disruption catalog (supervised-learning labels)
    op.create_table(
        "landslide_events",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "edge_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("road_edges.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("longitude", sa.Float(), nullable=False),
        sa.Column("latitude", sa.Float(), nullable=False),
        sa.Column("occurred_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("source", sa.String(32), nullable=False),
        sa.Column("severity", sa.String(16), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
    )
    op.create_index("ix_landslide_events_edge_id", "landslide_events", ["edge_id"])
    op.create_index("ix_landslide_events_occurred_at", "landslide_events", ["occurred_at"])


def downgrade() -> None:
    op.drop_index("ix_landslide_events_occurred_at", table_name="landslide_events")
    op.drop_index("ix_landslide_events_edge_id", table_name="landslide_events")
    op.drop_table("landslide_events")
    op.drop_index("ix_edge_weather_features_edge_observed", table_name="edge_weather_features")
    op.drop_table("edge_weather_features")
    op.drop_table("edge_terrain_features")
