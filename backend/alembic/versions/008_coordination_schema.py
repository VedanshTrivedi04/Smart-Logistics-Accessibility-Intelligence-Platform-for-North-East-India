"""008_coordination_schema — Coordination actions (acknowledge, escalate, assign, inspect, note).

Revision ID: 008_coordination_schema
Revises: 007_hazard_schema
Create Date: 2026-09-24
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "008_coordination_schema"
down_revision = "007_hazard_schema"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "coordination_actions",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("subject_type", sa.String(24), nullable=False),
        sa.Column("subject_ref", sa.String(128), nullable=False),
        sa.Column("action", sa.String(24), nullable=False),
        sa.Column("target_jurisdiction_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("jurisdictions.id", ondelete="RESTRICT"), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("actor_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("actor_role", sa.String(32), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_coordination_actions_subject", "coordination_actions", ["subject_type", "subject_ref", "created_at"])
    op.create_index("ix_coordination_actions_created_at", "coordination_actions", ["created_at"])


def downgrade() -> None:
    op.drop_table("coordination_actions")
