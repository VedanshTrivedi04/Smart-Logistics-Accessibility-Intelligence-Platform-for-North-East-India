"""
app/modules/incidents/application/triage_report.py — Report Triage Use Case (Claiming UNDER_REVIEW).
"""

from __future__ import annotations

from uuid import UUID

from app.core.security import PrincipalContext
from app.modules.identity.domain.enums import Capability
from app.modules.incidents.domain.exceptions import (
    JurisdictionScopeError,
    SelfVerificationForbiddenError,
)
from app.modules.reporting.application.ports import ReportingRepositoryPort
from app.modules.reporting.domain.entities import FieldReport
from app.modules.reporting.domain.enums import ReviewState
from app.modules.reporting.domain.exceptions import ReportNotFoundError


class TriageReportUseCase:
    """Claims a submitted or provisional observation for review and investigation."""

    def __init__(self, reporting_repo: ReportingRepositoryPort) -> None:
        self.reporting_repo = reporting_repo

    async def execute(
        self,
        principal: PrincipalContext,
        report_id: UUID,
    ) -> FieldReport:
        report = await self.reporting_repo.get_report_by_id(report_id)
        if not report:
            raise ReportNotFoundError(f"Report {report_id} not found.")

        # 1. Anti-self-verification
        if report.reporter_id == principal.user_id:
            raise SelfVerificationForbiddenError()

        # 2. Jurisdiction scope check
        if report.jurisdiction_id and not principal.has_jurisdiction(report.jurisdiction_id):
            raise JurisdictionScopeError(
                f"Principal lacks jurisdiction scope over {report.jurisdiction_id}."
            )

        # 3. Transition to UNDER_REVIEW
        report.review_state = ReviewState.UNDER_REVIEW
        return await self.reporting_repo.update_report(report)
