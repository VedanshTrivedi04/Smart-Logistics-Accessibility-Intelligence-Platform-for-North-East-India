"""011_report_altitude_road_side — Add altitude_m and road_side columns to reports.

Revision ID: 011_report_altitude_road_side
Revises: 010_report_passability
Create Date: 2026-09-25
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "011_report_altitude_road_side"
down_revision = "010_report_passability"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("reports", sa.Column("altitude_m", sa.Float(), nullable=True))
    op.add_column("reports", sa.Column("road_side", sa.String(24), nullable=True))


def downgrade() -> None:
    op.drop_column("reports", "road_side")
    op.drop_column("reports", "altitude_m")
