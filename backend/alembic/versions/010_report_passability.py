"""010_report_passability — Reporter-observed passability fields on field reports.

Adds lane availability, vehicle classes seen passing, and a life-safety flag.
These are observations from the field, not verified facts.

Revision ID: 010_report_passability
Revises: 009_merge_cv_verification
Create Date: 2026-09-25
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "010_report_passability"
down_revision = "009_merge_cv_verification"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("reports", sa.Column("lane_status", sa.String(24), nullable=True))
    op.add_column(
        "reports",
        sa.Column("passable_classes", postgresql.JSONB(), nullable=False, server_default="[]"),
    )
    op.add_column(
        "reports",
        sa.Column("life_safety_risk", sa.Boolean(), nullable=False, server_default=sa.false()),
    )


def downgrade() -> None:
    op.drop_column("reports", "life_safety_risk")
    op.drop_column("reports", "passable_classes")
    op.drop_column("reports", "lane_status")
