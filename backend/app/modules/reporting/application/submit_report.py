"""
app/modules/reporting/application/submit_report.py — Field Report Submission Use Case.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime
from typing import TYPE_CHECKING
from uuid import UUID

from app.core.security import PrincipalContext
from app.modules.reporting.application.ports import ReportingRepositoryPort

if TYPE_CHECKING:
    from app.modules.incidents.application.ports import IncidentRepositoryPort
from app.modules.reporting.domain.entities import FieldReport, LocationPoint
from app.modules.reporting.domain.enums import (
    ReportSeverity,
    ReportType,
    ReviewState,
    ScanStatus,
)
from app.modules.reporting.domain.exceptions import (
    DuplicateOperationError,
    MediaNotFoundError,
    MediaScanNotCleanError,
)


class SubmitFieldReportUseCase:
    """Use case to process, validate, and persist new field incident reports."""

    def __init__(
        self,
        reporting_repo: ReportingRepositoryPort,
        incident_repo: IncidentRepositoryPort | None = None,
    ) -> None:
        self.reporting_repo = reporting_repo
        self.incident_repo = incident_repo

    async def execute(
        self,
        principal: PrincipalContext,
        report_type: ReportType,
        severity: ReportSeverity,
        description: str,
        location: LocationPoint,
        observed_at: datetime,
        client_operation_id: str | None = None,
        device_id: str | None = None,
        app_instance_id: str | None = None,
        media_ids: list[UUID] | None = None,
        candidate_edge_id: UUID | None = None,
        candidate_bridge_id: UUID | None = None,
    ) -> FieldReport:
        # 1. Location and timestamp validation
        location.validate()
        received_at = datetime.now(UTC)

        # 2. Idempotency check across actor scope
        if client_operation_id:
            existing = await self.reporting_repo.find_by_client_operation_id(
                principal.user_id, client_operation_id
            )
            if existing:
                # If identical report exists, return it (idempotent replay)
                if (
                    existing.report_type == report_type
                    and existing.severity == severity
                    and existing.description == description
                ):
                    return existing
                raise DuplicateOperationError(
                    f"Operation ID '{client_operation_id}' was already submitted with different data."
                )

        # 3. Spatial edge & bridge candidate resolution if not explicitly provided
        resolved_edge_id = candidate_edge_id
        resolved_bridge_id = candidate_bridge_id

        if not resolved_edge_id:
            edges = await self.reporting_repo.find_candidate_edges(
                lon=location.longitude,
                lat=location.latitude,
                radius_meters=250.0,
            )
            if edges:
                resolved_edge_id = UUID(str(edges[0]["id"]))

        if not resolved_bridge_id:
            bridges = await self.reporting_repo.find_candidate_bridges(
                lon=location.longitude,
                lat=location.latitude,
                radius_meters=50.0,
            )
            if bridges:
                resolved_bridge_id = UUID(str(bridges[0]["id"]))

        # 4. Media attachment validation
        validated_media_ids: list[UUID] = []
        if media_ids:
            for mid in media_ids:
                media_obj = await self.reporting_repo.get_media_by_id(mid)
                if not media_obj:
                    raise MediaNotFoundError(f"Media object {mid} not found.")
                if media_obj.scan_status not in {ScanStatus.CLEAN, ScanStatus.PENDING_SCAN}:
                    raise MediaScanNotCleanError(
                        f"Media {mid} scan status is {media_obj.scan_status.value}."
                    )
                validated_media_ids.append(mid)

        # 5. Construct domain entity
        report = FieldReport(
            id=uuid.uuid4(),
            reporter_id=principal.user_id,
            organization_id=getattr(principal, "org_id", getattr(principal, "organization_id", None)),
            jurisdiction_id=next(iter(principal.jurisdiction_ids)) if principal.jurisdiction_ids else None,
            client_operation_id=client_operation_id,
            device_id=device_id,
            app_instance_id=app_instance_id,
            report_type=report_type,
            severity=severity,
            description=description,
            location=location,
            candidate_edge_id=resolved_edge_id,
            candidate_bridge_id=resolved_bridge_id,
            observed_at=observed_at,
            received_at=received_at,
            created_at=received_at,
            media_ids=validated_media_ids,
            review_state=ReviewState.SUBMITTED,
        )
        report.validate_timestamps()

        # 6. Policy 21: Auto-Trigger High-Severity Provisional Caution
        role_name = getattr(principal.role, "name", str(principal.role))
        roles = [role_name]
        if report.should_auto_provisional_caution(roles):
            report.is_provisional_caution = True
            report.review_state = ReviewState.PROVISIONAL_CAUTION

            # Queue outbox notification if incident_repo available
            if self.incident_repo:
                from app.modules.incidents.domain.entities import OutboxEvent
                outbox_evt = OutboxEvent(
                    id=uuid.uuid4(),
                    event_type="REVIEW_REQUIRED_PROVISIONAL_CAUTION",
                    payload={
                        "report_id": str(report.id),
                        "edge_id": str(resolved_edge_id) if resolved_edge_id else None,
                        "report_type": report.report_type.value,
                        "severity": report.severity.value,
                        "observed_at": report.observed_at.isoformat(),
                    },
                )
                await self.incident_repo.create_outbox_event(outbox_evt)

        # 7. Persist
        return await self.reporting_repo.create_report(report)
