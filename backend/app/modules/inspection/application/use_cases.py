"""
app/modules/inspection/application/use_cases.py — Use Cases for Inspection Module.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime
from typing import Any
from uuid import UUID

from app.modules.identity.domain.principal import PrincipalContext
from app.modules.identity.domain.enums import Capability
from app.modules.incidents.application.verify_report import VerifyReportUseCase
from app.modules.incidents.domain.enums import ReviewDecisionKind
from app.modules.inspection.application.ports import InspectionRepositoryPort
from app.modules.inspection.domain.entities import (
    Inspection,
    InspectionEvidence,
    TechnicalAssessment,
)
from app.modules.inspection.domain.enums import (
    DamageType,
    EvidenceKind,
    InspectionPriority,
    InspectionStatus,
    PassabilityStatus,
    StructuralStability,
)
from app.modules.inspection.domain.exceptions import (
    InspectionAssignmentError,
    InspectionNotFoundError,
    InspectionStateError,
    InspectionValidationError,
    SelfInspectionForbiddenError,
)
from app.modules.network.application.declare_edge_status import DeclareEdgeStatusUseCase
from app.modules.network.domain.enums import AccessibilityStatus, SourceEventType
from app.modules.reporting.application.ports import ReportingRepositoryPort
from app.modules.reporting.domain.enums import ReviewState, ScanStatus


class AssignInspectionUseCase:
    """Dispatches a formal inspection task to an inspector for a report or road edge."""

    def __init__(self, inspection_repo: InspectionRepositoryPort) -> None:
        self.inspection_repo = inspection_repo

    async def execute(
        self,
        *,
        principal: PrincipalContext,
        jurisdiction_id: UUID,
        assigned_to: UUID,
        priority: InspectionPriority = InspectionPriority.MEDIUM,
        instructions: str = "",
        report_id: UUID | None = None,
        candidate_edge_id: str | None = None,
        incident_id: UUID | None = None,
    ) -> Inspection:
        if not principal.can(Capability.ASSIGN_INSPECTION) and not principal.can(Capability.COORDINATE_RESPONSE):
            raise InspectionAssignmentError("Principal lacks authority to assign inspections.")

        now = datetime.now(UTC)
        inspection = Inspection(
            id=uuid.uuid4(),
            jurisdiction_id=jurisdiction_id,
            assigned_to=assigned_to,
            assigned_by=principal.user_id,
            priority=priority,
            status=InspectionStatus.ASSIGNED,
            instructions=instructions,
            report_id=report_id,
            incident_id=incident_id,
            candidate_edge_id=candidate_edge_id,
            created_at=now,
            updated_at=now,
        )
        return await self.inspection_repo.create_inspection(inspection)


class ListInspectionsUseCase:
    """Lists inspections with optional scoping by assigned inspector, jurisdiction, or status."""

    def __init__(self, inspection_repo: InspectionRepositoryPort) -> None:
        self.inspection_repo = inspection_repo

    async def execute(
        self,
        *,
        principal: PrincipalContext,
        assigned_to: UUID | None = None,
        jurisdiction_id: UUID | None = None,
        status: InspectionStatus | None = None,
        edge_id: str | None = None,
        limit: int = 50,
        offset: int = 0,
    ) -> list[Inspection]:
        # If actor does not have authority to assign/coordinate, scope to their own user_id
        effective_assigned_to = assigned_to
        if not principal.can(Capability.ASSIGN_INSPECTION) and not principal.can(Capability.COORDINATE_RESPONSE):
            effective_assigned_to = principal.user_id

        return await self.inspection_repo.list_inspections(
            assigned_to=effective_assigned_to,
            jurisdiction_id=jurisdiction_id,
            status=status,
            edge_id=edge_id,
            limit=limit,
            offset=offset,
        )


def _is_supervisor(principal: PrincipalContext) -> bool:
    """A supervisor may act on any inspector's task (assign, override, view). An individual
    inspector may only act on their own assigned task."""
    return principal.can(Capability.ASSIGN_INSPECTION) or principal.can(Capability.COORDINATE_RESPONSE)


def _can_view(inspection: Inspection, principal: PrincipalContext) -> bool:
    return inspection.assigned_to == principal.user_id or _is_supervisor(principal)


class GetInspectionDetailUseCase:
    """Fetches full inspection dossier including technical assessment and linked evidence."""

    def __init__(self, inspection_repo: InspectionRepositoryPort) -> None:
        self.inspection_repo = inspection_repo

    async def execute(self, inspection_id: UUID, principal: PrincipalContext) -> Inspection:
        inspection = await self.inspection_repo.get_inspection_by_id(inspection_id)
        # Not found and not permitted look the same: an inspection's existence is not revealed
        # to a principal who is neither the assigned inspector nor a supervisor.
        if not inspection or not _can_view(inspection, principal):
            raise InspectionNotFoundError(f"Inspection {inspection_id} not found.")
        return inspection


class GetLatestEdgeInspectionUseCase:
    """Fetches the most recent inspection for a road edge, scoped the same way as inspection detail."""

    def __init__(self, inspection_repo: InspectionRepositoryPort) -> None:
        self.inspection_repo = inspection_repo

    async def execute(self, edge_id: str, principal: PrincipalContext) -> Inspection | None:
        latest = await self.inspection_repo.get_latest_inspection_for_edge(edge_id)
        if not latest or not _can_view(latest, principal):
            return None
        return latest


class StartInspectionUseCase:
    """Begins on-site inspection. If linked to an unreviewed report, claims it to UNDER_REVIEW."""

    def __init__(
        self,
        inspection_repo: InspectionRepositoryPort,
        reporting_repo: ReportingRepositoryPort | None = None,
    ) -> None:
        self.inspection_repo = inspection_repo
        self.reporting_repo = reporting_repo

    async def execute(self, inspection_id: UUID, principal: PrincipalContext) -> Inspection:
        inspection = await self.inspection_repo.get_inspection_by_id(inspection_id)
        if not inspection:
            raise InspectionNotFoundError(f"Inspection {inspection_id} not found.")

        if inspection.assigned_to != principal.user_id and not principal.can(Capability.ASSIGN_INSPECTION):
            raise InspectionAssignmentError("You are not the designated inspector for this task.")

        inspection.start(principal.user_id)

        # Claim linked report into UNDER_REVIEW if applicable
        if inspection.report_id and self.reporting_repo:
            report = await self.reporting_repo.get_report_by_id(inspection.report_id)
            if report and report.review_state in (ReviewState.SUBMITTED, ReviewState.PROVISIONAL_CAUTION):
                report.review_state = ReviewState.UNDER_REVIEW
                await self.reporting_repo.update_report(report)

        return await self.inspection_repo.update_inspection(inspection)


class SubmitInspectionAssessmentUseCase:
    """Records quantitative engineering measurements and evidence photos."""

    def __init__(
        self,
        inspection_repo: InspectionRepositoryPort,
        reporting_repo: ReportingRepositoryPort | None = None,
    ) -> None:
        self.inspection_repo = inspection_repo
        self.reporting_repo = reporting_repo

    async def execute(
        self,
        inspection_id: UUID,
        principal: PrincipalContext,
        assessment: TechnicalAssessment,
        new_evidence: list[InspectionEvidence] | None = None,
    ) -> Inspection:
        inspection = await self.inspection_repo.get_inspection_by_id(inspection_id)
        if not inspection:
            raise InspectionNotFoundError(f"Inspection {inspection_id} not found.")

        if inspection.assigned_to != principal.user_id and not principal.can(Capability.ASSIGN_INSPECTION):
            raise InspectionAssignmentError("You are not the designated inspector for this task.")

        assessment.validate()
        inspection.assessment = assessment

        if new_evidence:
            # A photo must be a real, already-uploaded, clean image owned by this inspector.
            # Without this, a bad or forged media_id fails as a raw database foreign-key error
            # instead of a clean, reportable validation error.
            if self.reporting_repo:
                for ev in new_evidence:
                    media_obj = await self.reporting_repo.get_media_by_id(ev.media_id)
                    if not media_obj or media_obj.uploader_id != principal.user_id:
                        raise InspectionValidationError(f"Photo {ev.media_id} was not found or was not uploaded by you.")
                    if media_obj.scan_status != ScanStatus.CLEAN:
                        raise InspectionValidationError(f"Photo {ev.media_id} has not passed validation yet ({media_obj.scan_status.value}).")
            for ev in new_evidence:
                await self.inspection_repo.add_evidence(ev)

        return await self.inspection_repo.update_inspection(inspection)


class DecideInspectionUseCase:
    """
    Submits authoritative inspection decision.
    Wires atomically into VerifyReportUseCase for report-linked inspections,
    or DeclareEdgeStatusUseCase for direct corridor clearance / closure.
    """

    def __init__(
        self,
        inspection_repo: InspectionRepositoryPort,
        reporting_repo: ReportingRepositoryPort,
        verify_report_use_case: VerifyReportUseCase | None = None,
        declare_status_use_case: DeclareEdgeStatusUseCase | None = None,
    ) -> None:
        self.inspection_repo = inspection_repo
        self.reporting_repo = reporting_repo
        self.verify_report_use_case = verify_report_use_case
        self.declare_status_use_case = declare_status_use_case

    async def execute(
        self,
        *,
        inspection_id: UUID,
        principal: PrincipalContext,
        decision: str,  # VERIFIED, REJECTED, MORE_INFO_NEEDED, REINSPECTION_REQUIRED, CLEARANCE_RESTORED
        notes: str | None = None,
        rejection_reason: str | None = None,
        affected_edges: list[tuple[str, str, bool]] | None = None,
    ) -> dict[str, Any]:
        inspection = await self.inspection_repo.get_inspection_by_id(inspection_id)
        if not inspection:
            raise InspectionNotFoundError(f"Inspection {inspection_id} not found.")

        if not _can_view(inspection, principal):
            raise InspectionAssignmentError("You are not authorized to adjudicate this inspection.")

        # Anti-self-verification rule
        if inspection.report_id:
            report = await self.reporting_repo.get_report_by_id(inspection.report_id)
            if report and report.reporter_id == principal.user_id:
                raise SelfInspectionForbiddenError("Anti-self-verification: Reporter cannot inspect or verify their own submission.")

        result: dict[str, Any] = {"inspection_id": str(inspection.id), "decision": decision}

        if decision in ("VERIFIED", "CONFIRM_INCIDENT"):
            if inspection.report_id and self.verify_report_use_case:
                v_res = await self.verify_report_use_case.execute(
                    report_id=inspection.report_id,
                    decision=ReviewDecisionKind.CONFIRM_INCIDENT,
                    principal=principal,
                    notes=notes,
                    affected_edges=affected_edges,
                )
                result["verification"] = v_res
            elif inspection.candidate_edge_id and self.declare_status_use_case:
                await self.declare_status_use_case.execute(
                    edge_id=inspection.candidate_edge_id,
                    status=AccessibilityStatus.BLOCKED,
                    reason=f"Inspection confirmed hazard: {notes or 'Structural blockage'}",
                    source_event_type=SourceEventType.FIELD_REPORT,
                    actor_user_id=principal.user_id,
                )
            inspection.complete(decision, notes)

        elif decision in ("REJECTED", "REJECT_REPORT"):
            if inspection.report_id and self.verify_report_use_case:
                from app.modules.reporting.domain.enums import RejectionReason
                rej_enum = RejectionReason(rejection_reason) if rejection_reason else RejectionReason.OTHER
                v_res = await self.verify_report_use_case.execute(
                    report_id=inspection.report_id,
                    decision=ReviewDecisionKind.REJECT_REPORT,
                    principal=principal,
                    notes=notes,
                    rejection_reason=rej_enum,
                )
                result["verification"] = v_res
            inspection.complete(decision, notes)

        elif decision in ("MORE_INFO_NEEDED", "REQUEST_MORE_INFO"):
            if inspection.report_id and self.verify_report_use_case:
                v_res = await self.verify_report_use_case.execute(
                    report_id=inspection.report_id,
                    decision=ReviewDecisionKind.REQUEST_MORE_INFO,
                    principal=principal,
                    notes=notes,
                )
                result["verification"] = v_res
            # No dedicated inspection status exists for "more information requested"; it is not
            # a terminal outcome, so the task is left open the same way as a required recheck.
            inspection.mark_reinspection_required(notes)

        elif decision in ("REINSPECTION_REQUIRED", "REQUEST_REINSPECTION"):
            if inspection.report_id and self.verify_report_use_case:
                v_res = await self.verify_report_use_case.execute(
                    report_id=inspection.report_id,
                    decision=ReviewDecisionKind.REQUEST_REINSPECTION,
                    principal=principal,
                    notes=notes,
                )
                result["verification"] = v_res
            inspection.mark_reinspection_required(notes)

        elif decision in ("CLEARANCE_RESTORED", "ROAD_OPEN"):
            # Direct restoration of road edge with immediate impact recalculation event
            edge_id = inspection.candidate_edge_id
            if edge_id and self.declare_status_use_case:
                await self.declare_status_use_case.execute(
                    edge_id=edge_id,
                    status=AccessibilityStatus.OPEN,
                    reason=f"Inspection confirmed clearance restored: {notes or 'Road open to traffic'}",
                    source_event_type=SourceEventType.OFFICIAL_DECISION,
                    actor_user_id=principal.user_id,
                )
            inspection.complete(decision, notes)

        else:
            inspection.complete(decision, notes)

        await self.inspection_repo.update_inspection(inspection)
        return result


class GetInspectionStatsUseCase:
    """Computes KPI counts for inspector home dashboard."""

    def __init__(self, inspection_repo: InspectionRepositoryPort) -> None:
        self.inspection_repo = inspection_repo

    async def execute(self, *, principal: PrincipalContext) -> dict[str, int]:
        assigned_to = principal.user_id if not principal.can(Capability.ASSIGN_INSPECTION) else None
        return await self.inspection_repo.count_by_status(assigned_to=assigned_to)
