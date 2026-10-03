"""009_merge_cv_verification — Merge CV-verification branch into main migration head.

This migration merges the 008_reporting_cv_verification branch (CV hazard columns
on the reports table) with the 008_coordination_schema main head.

Revision ID: 009_merge_cv_verification
Revises: 008_coordination_schema, 008_reporting_cv_verification
Create Date: 2026-09-24
"""

from __future__ import annotations

from alembic import op

revision = "009_merge_cv_verification"
down_revision = ("008_coordination_schema", "008_reporting_cv_verification")
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Pure merge point - no schema changes needed.
    # All columns were added by 008_reporting_cv_verification.
    pass


def downgrade() -> None:
    pass
