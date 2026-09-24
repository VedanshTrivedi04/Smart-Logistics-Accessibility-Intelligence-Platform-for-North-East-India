"""
app/modules/reporting/application/amend_report.py — Field Report Amendment Use Case.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime
from uuid import UUID

from app.core.exceptions import ForbiddenError, ValidationError
from app.core.security import PrincipalContext
from app.modules.reporting.application.ports import ReportingRepositoryPort
from app.modules.reporting.application.submit_report import SubmitFieldReportUseCase
from app.modules.reporting.domain.entities import FieldReport, LocationPoint, ReportAmendment
from app.modules.reporting.domain.enums import (
    ReportSeverity,
    ReportType,
    ReviewState,
)
from app.modules.reporting.domain.exceptions import (
    ReportAlreadyAdjudicatedError,
    ReportNotFoundError,
)


class AmendReportUseCase:
    """Creates an immutable correction report linked to an original observation."""

    def __init__(
        self,
        reporting_repo: ReportingRepositoryPort,
        submit_use_case: SubmitFieldReportUseCase,
    ) -> None:
        self.reporting_repo = reporting_repo
        self.submit_use_case = submit_use_case

    async def execute(
        self,
        principal: PrincipalContext,
        original_report_id: UUID,
        reason: str,
        report_type: ReportType,
        severity: ReportSeverity,
        description: str,
        location: LocationPoint,
        observed_at: datetime,
        media_ids: list[UUID] | None = None,
        candidate_edge_id: UUID | None = None,
        candidate_bridge_id: UUID | None = None,
    ) -> FieldReport:
        if not reason or not reason.strip():
            raise ValidationError("An explicit explanation reason is required for amendments.")

        original = await self.reporting_repo.get_report_by_id(original_report_id)
        if not original:
            raise ReportNotFoundError(f"Original report {original_report_id} not found.")

        # Guard: Cannot amend already terminal reports (Policy 1 & 3)
        if original.review_state in {ReviewState.VERIFIED, ReviewState.REJECTED}:
            raise ReportAlreadyAdjudicatedError(
                f"Report {original_report_id} is in terminal state '{original.review_state.value}' "
                "and cannot be amended."
            )

        # Guard: Only original reporter or district verifiers can submit amendments
        role_name = getattr(principal.role, "name", str(principal.role))
        is_verifier = role_name in {"DISTRICT_VERIFIER", "STATE_AUTHORITY", "REGIONAL_AUTHORITY"}
        if original.reporter_id != principal.user_id and not is_verifier:
            raise ForbiddenError("Only the original reporter or an authorized verifier can submit an amendment.")

        # Create new report
        new_report = await self.submit_use_case.execute(
            principal=principal,
            report_type=report_type,
            severity=severity,
            description=description,
            location=location,
            observed_at=observed_at,
            media_ids=media_ids,
            candidate_edge_id=candidate_edge_id,
            candidate_bridge_id=candidate_bridge_id,
        )

        # Link as amendment
        new_report.amendment_of_report_id = original_report_id
        await self.reporting_repo.update_report(new_report)

        amendment = ReportAmendment(
            id=uuid.uuid4(),
            original_report_id=original_report_id,
            amendment_report_id=new_report.id,
            reason=reason.strip(),
            created_at=datetime.now(UTC),
        )
        await self.reporting_repo.create_amendment(amendment)

        # If original was in MORE_INFO_NEEDED, transition back to UNDER_REVIEW
        if original.review_state == ReviewState.MORE_INFO_NEEDED:
            original.review_state = ReviewState.UNDER_REVIEW
            await self.reporting_repo.update_report(original)

        return new_report
