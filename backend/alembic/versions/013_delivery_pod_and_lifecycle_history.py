"""013_delivery_pod_and_lifecycle_history — Add POD, lifecycle history and stop commitment linkage.

Revision ID: 013_delivery_pod_and_lifecycle_history
Revises: 012_inspections_schema
Create Date: 2026-09-28
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "013_delivery_pod_lifecycle"
down_revision = "012_inspections_schema"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 1. Delivery commitments lifecycle, POD and compatibility fields
    op.add_column("delivery_commitments", sa.Column("is_hazmat", sa.Boolean(), nullable=False, server_default=sa.text("false")))
    op.add_column("delivery_commitments", sa.Column("requires_cold_chain", sa.Boolean(), nullable=False, server_default=sa.text("false")))
    op.add_column("delivery_commitments", sa.Column("recipient_name", sa.String(128), nullable=True))
    op.add_column("delivery_commitments", sa.Column("recipient_organization", sa.String(128), nullable=True))
    op.add_column("delivery_commitments", sa.Column("pod_timestamp", sa.DateTime(timezone=True), nullable=True))
    op.add_column("delivery_commitments", sa.Column("pod_signature_acknowledgement", sa.String(256), nullable=True))
    op.add_column("delivery_commitments", sa.Column("delivery_condition", sa.String(64), nullable=True))
    op.add_column("delivery_commitments", sa.Column("previous_trip_code", sa.String(64), nullable=True))
    op.add_column("delivery_commitments", sa.Column("previous_trip_status", sa.String(32), nullable=True))
    op.add_column("delivery_commitments", sa.Column("cancellation_reason", sa.String(256), nullable=True))
    op.add_column("delivery_commitments", sa.Column("released_at", sa.DateTime(timezone=True), nullable=True))

    # 2. Trip stop commitment linkage for multi-stop delivery reconciliation
    op.add_column("trip_stops", sa.Column("commitment_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("delivery_commitments.id", ondelete="SET NULL"), nullable=True))
    op.create_index("ix_trip_stops_commitment_id", "trip_stops", ["commitment_id"])


def downgrade() -> None:
    op.drop_index("ix_trip_stops_commitment_id", "trip_stops")
    op.drop_column("trip_stops", "commitment_id")

    op.drop_column("delivery_commitments", "released_at")
    op.drop_column("delivery_commitments", "cancellation_reason")
    op.drop_column("delivery_commitments", "previous_trip_status")
    op.drop_column("delivery_commitments", "previous_trip_code")
    op.drop_column("delivery_commitments", "delivery_condition")
    op.drop_column("delivery_commitments", "pod_signature_acknowledgement")
    op.drop_column("delivery_commitments", "pod_timestamp")
    op.drop_column("delivery_commitments", "recipient_organization")
    op.drop_column("delivery_commitments", "recipient_name")
    op.drop_column("delivery_commitments", "requires_cold_chain")
    op.drop_column("delivery_commitments", "is_hazmat")
