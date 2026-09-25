"""010_reporting_cv_verification — CV Hazard-Verification Fields on Field Reports.

Revision ID: 010_reporting_cv_verification
Revises: 009_ai_feature_store
Create Date: 2026-09-23
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "010_reporting_cv_verification"
down_revision = "009_ai_feature_store"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("reports", sa.Column("cv_hazard_class", sa.String(32), nullable=True))
    op.add_column("reports", sa.Column("cv_severity_score", sa.Float(), nullable=True))
    op.add_column("reports", sa.Column("cv_confidence", sa.Float(), nullable=True))
    op.add_column("reports", sa.Column("cv_is_roadway_blocked", sa.Boolean(), nullable=True))
    op.add_column(
        "reports", sa.Column("cv_verified_at", sa.DateTime(timezone=True), nullable=True)
    )


def downgrade() -> None:
    op.drop_column("reports", "cv_verified_at")
    op.drop_column("reports", "cv_is_roadway_blocked")
    op.drop_column("reports", "cv_confidence")
    op.drop_column("reports", "cv_severity_score")
    op.drop_column("reports", "cv_hazard_class")
