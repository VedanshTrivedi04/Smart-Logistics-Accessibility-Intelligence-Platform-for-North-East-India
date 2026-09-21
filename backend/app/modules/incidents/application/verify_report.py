"""
app/modules/incidents/application/verify_report.py — Seven-Way Atomic Report Adjudication Use Case.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any
from uuid import UUID

from app.core.exceptions import ValidationError
from app.core.security import PrincipalContext
from app.modules.incidents.application.ports import IncidentRepositoryPort
from app.modules.incidents.domain.entities import Incident, OutboxEvent, ReviewDecision
from app.modules.incidents.domain.enums import (
    IncidentLifecycle,
    ReviewDecisionKind,
)
from app.modules.incidents.domain.exceptions import (
    JurisdictionScopeError,
    SelfVerificationForbiddenError,
    VersionConflictError,
)
from app.modules.network.application.declare_edge_status import DeclareEdgeStatusUseCase
from app.modules.network.domain.enums import AccessibilityStatus, SourceEventType
from app.modules.reporting.application.ports import ReportingRepositoryPort
from app.modules.reporting.domain.entities import FieldReport
from app.modules.reporting.domain.enums import (
    RejectionReason,
    ReportSeverity,
    ReviewState,
)
from app.modules.reporting.domain.exceptions import ReportNotFoundError


class VerifyReportUseCase:
    """
    Adjudicates a field observation inside a single atomic database transaction.
    Executes:
    1. Report review_state update
    2. ReviewDecision immutable audit record
    3. Incident creation or linkage
    4. Incident-edge linkage
    5. Phase 3 edge_status_events append
    6. Phase 3 edge_status_current projection update
    7. OutboxEvent publication
    """

    def __init__(
        self,
        reporting_repo: ReportingRepositoryPort,
        incident_repo: IncidentRepositoryPort,
        declare_status_use_case: DeclareEdgeStatusUseCase | None = None,
    ) -> None:
        self.reporting_repo = reporting_repo
        self.incident_repo = incident_repo
        self.declare_status_use_case = declare_status_use_case

    async def execute(
        self,
        principal: PrincipalContext,
        report_id: UUID,
        decision: ReviewDecisionKind,
        notes: str | None = None,
        rejection_reason: RejectionReason | None = None,
        existing_incident_id: UUID | None = None,
        affected_edges: list[tuple[UUID, str, bool]] | None = None,
        incident_title: str | None = None,
        if_match_version: int | None = None,
    ) -> dict[str, Any]:
        # 1. Fetch report
        report = await self.reporting_repo.get_report_by_id(report_id)
        if not report:
            raise ReportNotFoundError(f"Report {report_id} not found.")

        # 2. Strict Anti-Self-Verification
        if report.reporter_id == principal.user_id:
            raise SelfVerificationForbiddenError()

        # 3. Jurisdiction Scoping
        if report.jurisdiction_id and not principal.has_jurisdiction(report.jurisdiction_id):
            raise JurisdictionScopeError(
                f"Principal lacks jurisdiction scope over {report.jurisdiction_id}."
            )

        # 4. Optimistic Concurrency Check
        if if_match_version is not None and report.version != if_match_version:
            raise VersionConflictError(
                f"Report version mismatch: expected {if_match_version}, current {report.version}"
            )

        now = datetime.now(timezone.utc)
        created_incident: Incident | None = None

        # 5. Adjudicate based on decision kind
        if decision == ReviewDecisionKind.CONFIRM_INCIDENT:
            report.review_state = ReviewState.VERIFIED

            # Determine affected edges
            edges_to_link = affected_edges or []
            if not edges_to_link and report.candidate_edge_id:
                edges_to_link = [(report.candidate_edge_id, "BOTH", True)]

            if existing_incident_id:
                inc = await self.incident_repo.get_incident_by_id(existing_incident_id)
                if not inc:
                    raise ValidationError(f"Target incident {existing_incident_id} not found.")
                created_incident = inc
            else:
                title = incident_title or f"{report.report_type.value.replace('_', ' ').title()} Alert"
                created_incident = Incident(
                    id=uuid.uuid4(),
                    primary_report_id=report.id,
                    lifecycle=IncidentLifecycle.ACTIVE,
                    severity=report.severity,
                    title=title,
                    description=report.description,
                    created_at=now,
                )
                await self.incident_repo.create_incident(
                    incident=created_incident,
                    primary_report_id=report.id,
                    affected_edges=edges_to_link,
                )

            # Record review decision
            review_dec = ReviewDecision(
                id=uuid.uuid4(),
                report_id=report.id,
                reviewer_id=principal.user_id,
                decision=decision,
                notes=notes,
                incident_id=created_incident.id,
                created_at=now,
            )
            await self.incident_repo.create_review_decision(review_dec)

            # Phase 3 Synchronous Edge Traversability Update
            if self.declare_status_use_case and edges_to_link:
                edge_status = (
                    AccessibilityStatus.BLOCKED
                    if report.severity == ReportSeverity.CRITICAL or any(e[2] for e in edges_to_link)
                    else AccessibilityStatus.RESTRICTED
                )
                for edge_id, direction, is_full in edges_to_link:
                    await self.declare_status_use_case.execute(
                        edge_id=edge_id,
                        status=edge_status,
                        reason=f"Incident confirmed: {created_incident.title}",
                        source_event_type=SourceEventType.FIELD_REPORT,
                        actor_user_id=principal.user_id,
                        source_reference_id=created_incident.id,
                    )

            # Outbox Event
            evt_type = (
                "HIGH_SEVERITY_INCIDENT_CREATED"
                if report.severity in {ReportSeverity.HIGH, ReportSeverity.CRITICAL}
                else "ROAD_STATUS_DECLARED"
            )
            outbox_evt = OutboxEvent(
                id=uuid.uuid4(),
                event_type=evt_type,
                payload={
                    "incident_id": str(created_incident.id),
                    "report_id": str(report.id),
                    "severity": report.severity.value,
                    "title": created_incident.title,
                    "affected_edges": [str(e[0]) for e in edges_to_link],
                },
            )
            await self.incident_repo.create_outbox_event(outbox_evt)

        elif decision == ReviewDecisionKind.REJECT_REPORT:
            if not rejection_reason:
                raise ValidationError("Rejection requires a valid rejection_reason enum code.")
            report.review_state = ReviewState.REJECTED
            report.rejection_reason = rejection_reason
            report.rejection_notes = notes

            review_dec = ReviewDecision(
                id=uuid.uuid4(),
                report_id=report.id,
                reviewer_id=principal.user_id,
                decision=decision,
                notes=notes,
                rejection_reason=rejection_reason,
                created_at=now,
            )
            await self.incident_repo.create_review_decision(review_dec)

        elif decision == ReviewDecisionKind.REQUEST_MORE_INFO:
            report.review_state = ReviewState.MORE_INFO_NEEDED
            review_dec = ReviewDecision(
                id=uuid.uuid4(),
                report_id=report.id,
                reviewer_id=principal.user_id,
                decision=decision,
                notes=notes,
                created_at=now,
            )
            await self.incident_repo.create_review_decision(review_dec)

        # Update report in repository
        updated_report = await self.reporting_repo.update_report(report)

        return {
            "report_id": str(updated_report.id),
            "review_state": updated_report.review_state.value,
            "version": updated_report.version,
            "incident_id": str(created_incident.id) if created_incident else None,
            "decision": decision.value,
        }
