"""004_reporting_incident_schema — Field Incident Reporting, Adjudication, Media & Transactional Outbox.

Revision ID: 004_reporting_incident_schema
Revises: 003_network_schema
Create Date: 2026-09-21
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from geoalchemy2 import Geometry
from sqlalchemy.dialects import postgresql

revision = "004_reporting_incident_schema"
down_revision = "003_network_schema"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 1. reports
    op.create_table(
        "reports",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("reporter_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("organizations.id", ondelete="SET NULL"), nullable=True),
        sa.Column("jurisdiction_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("jurisdictions.id", ondelete="SET NULL"), nullable=True),
        sa.Column("client_operation_id", sa.String(128), nullable=True),
        sa.Column("device_id", sa.String(128), nullable=True),
        sa.Column("app_instance_id", sa.String(128), nullable=True),
        sa.Column("report_type", sa.String(32), nullable=False),
        sa.Column("severity", sa.String(16), nullable=False),
        sa.Column("review_state", sa.String(32), nullable=False, server_default=sa.text("'SUBMITTED'")),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("geom", Geometry(geometry_type="POINT", srid=4326), nullable=False),
        sa.Column("accuracy_m", sa.Float(), nullable=False),
        sa.Column("location_provider", sa.String(32), nullable=False, server_default=sa.text("'GPS_HARDWARE'")),
        sa.Column("candidate_edge_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("road_edges.id", ondelete="SET NULL"), nullable=True),
        sa.Column("candidate_bridge_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("bridges.id", ondelete="SET NULL"), nullable=True),
        sa.Column("is_provisional_caution", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("rejection_reason", sa.String(64), nullable=True),
        sa.Column("rejection_notes", sa.Text(), nullable=True),
        sa.Column("amendment_of_report_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("reports.id", ondelete="SET NULL"), nullable=True),
        sa.Column("observed_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("received_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("version", sa.Integer(), nullable=False, server_default=sa.text("1")),
        sa.UniqueConstraint("reporter_id", "client_operation_id", name="uq_reports_reporter_client_op_id"),
    )
    op.create_index("ix_reports_reporter_id", "reports", ["reporter_id"])
    op.create_index("ix_reports_review_state", "reports", ["review_state"])
    op.create_index("ix_reports_jurisdiction_id", "reports", ["jurisdiction_id"])
    op.create_index("ix_reports_candidate_edge_id", "reports", ["candidate_edge_id"])
    op.create_index("ix_reports_observed_at", "reports", ["observed_at"])

    # 2. report_amendments
    op.create_table(
        "report_amendments",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("original_report_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("reports.id", ondelete="CASCADE"), nullable=False),
        sa.Column("amendment_report_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("reports.id", ondelete="CASCADE"), nullable=False),
        sa.Column("reason", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_report_amendments_orig", "report_amendments", ["original_report_id"])

    # 3. media_objects
    op.create_table(
        "media_objects",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("uploader_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("bucket", sa.String(128), nullable=False),
        sa.Column("object_key", sa.String(512), unique=True, nullable=False),
        sa.Column("file_name", sa.String(255), nullable=False),
        sa.Column("file_size_bytes", sa.Integer(), nullable=False),
        sa.Column("mime_type", sa.String(64), nullable=False),
        sa.Column("checksum_sha256", sa.String(64), nullable=False),
        sa.Column("scan_status", sa.String(32), nullable=False, server_default=sa.text("'PENDING_SCAN'")),
        sa.Column("scan_findings", postgresql.JSONB(), nullable=True),
        sa.Column("width_px", sa.Integer(), nullable=True),
        sa.Column("height_px", sa.Integer(), nullable=True),
        sa.Column("exif_lat", sa.Float(), nullable=True),
        sa.Column("exif_lon", sa.Float(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_media_objects_uploader", "media_objects", ["uploader_id"])
    op.create_index("ix_media_objects_scan_status", "media_objects", ["scan_status"])
    op.create_index("ix_media_objects_checksum", "media_objects", ["checksum_sha256"])

    # 4. report_media
    op.create_table(
        "report_media",
        sa.Column("report_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("reports.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("media_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("media_objects.id", ondelete="CASCADE"), primary_key=True),
    )

    # 5. sync_results (idempotency cache)
    op.create_table(
        "sync_results",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("reporter_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("client_operation_id", sa.String(128), nullable=False),
        sa.Column("status_code", sa.Integer(), nullable=False),
        sa.Column("response_payload", postgresql.JSONB(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("reporter_id", "client_operation_id", name="uq_sync_results_reporter_op"),
    )
    op.create_index("ix_sync_results_reporter_op", "sync_results", ["reporter_id", "client_operation_id"])

    # 6. incidents
    op.create_table(
        "incidents",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("primary_report_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("reports.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("lifecycle", sa.String(32), nullable=False, server_default=sa.text("'ACTIVE'")),
        sa.Column("severity", sa.String(16), nullable=False),
        sa.Column("title", sa.String(255), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("resolution_reason", sa.String(64), nullable=True),
        sa.Column("resolution_notes", sa.Text(), nullable=True),
        sa.Column("resolved_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("resolved_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("reopened_reason", sa.Text(), nullable=True),
        sa.Column("reopened_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("reopened_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("version", sa.Integer(), nullable=False, server_default=sa.text("1")),
    )
    op.create_index("ix_incidents_lifecycle", "incidents", ["lifecycle"])
    op.create_index("ix_incidents_severity", "incidents", ["severity"])
    op.create_index("ix_incidents_created_at", "incidents", ["created_at"])

    # 7. incident_reports
    op.create_table(
        "incident_reports",
        sa.Column("incident_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("incidents.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("report_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("reports.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("is_primary", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("linked_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )

    # 8. incident_edges
    op.create_table(
        "incident_edges",
        sa.Column("incident_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("incidents.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("edge_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("road_edges.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("affected_direction", sa.String(16), nullable=False, server_default=sa.text("'BOTH'")),
        sa.Column("is_full_closure", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("linked_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_incident_edges_edge_id", "incident_edges", ["edge_id"])

    # 9. incident_merges
    op.create_table(
        "incident_merges",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("source_incident_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("incidents.id", ondelete="CASCADE"), nullable=False),
        sa.Column("target_incident_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("incidents.id", ondelete="CASCADE"), nullable=False),
        sa.Column("merged_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("merged_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_incident_merges_source", "incident_merges", ["source_incident_id"])
    op.create_index("ix_incident_merges_target", "incident_merges", ["target_incident_id"])

    # 10. review_decisions
    op.create_table(
        "review_decisions",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("report_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("reports.id", ondelete="CASCADE"), nullable=False),
        sa.Column("reviewer_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("decision", sa.String(32), nullable=False),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("rejection_reason", sa.String(64), nullable=True),
        sa.Column("incident_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("incidents.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_review_decisions_report_id", "review_decisions", ["report_id"])
    op.create_index("ix_review_decisions_reviewer_id", "review_decisions", ["reviewer_id"])

    # 11. outbox_events
    op.create_table(
        "outbox_events",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("event_type", sa.String(128), nullable=False),
        sa.Column("payload", postgresql.JSONB(), nullable=False),
        sa.Column("status", sa.String(32), nullable=False, server_default=sa.text("'PENDING'")),
        sa.Column("retry_count", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.Column("max_retries", sa.Integer(), nullable=False, server_default=sa.text("5")),
        sa.Column("last_error", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("dispatched_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("failed_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_outbox_events_status", "outbox_events", ["status"])
    op.create_index("ix_outbox_events_created_at", "outbox_events", ["created_at"])

    # 12. outbox_consumer_receipts
    op.create_table(
        "outbox_consumer_receipts",
        sa.Column("consumer_id", sa.String(128), primary_key=True),
        sa.Column("event_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("outbox_events.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("processed_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )


def downgrade() -> None:
    op.drop_table("outbox_consumer_receipts")
    op.drop_table("outbox_events")
    op.drop_table("review_decisions")
    op.drop_table("incident_merges")
    op.drop_table("incident_edges")
    op.drop_table("incident_reports")
    op.drop_table("incidents")
    op.drop_table("sync_results")
    op.drop_table("report_media")
    op.drop_table("media_objects")
    op.drop_table("report_amendments")
    op.drop_table("reports")
