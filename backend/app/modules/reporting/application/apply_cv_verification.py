"""
app/modules/reporting/application/apply_cv_verification.py — Use case for recording
AI/ML CV hazard-verification results against a field report.
"""

from __future__ import annotations

from datetime import UTC, datetime
from uuid import UUID

from app.modules.reporting.application.ports import ReportingRepositoryPort
from app.modules.reporting.domain.entities import FieldReport
from app.modules.reporting.domain.enums import ReviewState
from app.modules.reporting.domain.exceptions import ReportNotFoundError


class ApplyCvVerificationUseCase:
    """
    Records a CV hazard-verification result on a report and, if the report is
    still awaiting initial review, auto-escalates it to PROVISIONAL_CAUTION on
    a high-confidence roadway-blocked detection. Never overrides a review
    state a human reviewer (or another automated policy) has already set —
    human review stays authoritative.
    """

    def __init__(self, reporting_repo: ReportingRepositoryPort) -> None:
        self.reporting_repo = reporting_repo

    async def execute(
        self,
        report_id: UUID,
        hazard_class: str,
        severity_score: float,
        confidence: float,
        is_roadway_blocked: bool,
    ) -> FieldReport:
        report = await self.reporting_repo.get_report_by_id(report_id)
        if not report:
            raise ReportNotFoundError(f"Report {report_id} not found.")

        report.cv_hazard_class = hazard_class
        report.cv_severity_score = severity_score
        report.cv_confidence = confidence
        report.cv_is_roadway_blocked = is_roadway_blocked
        report.cv_verified_at = datetime.now(UTC)

        if (
            report.review_state == ReviewState.SUBMITTED
            and report.should_auto_provisional_caution_from_cv()
        ):
            report.is_provisional_caution = True
            report.review_state = ReviewState.PROVISIONAL_CAUTION

        return await self.reporting_repo.update_report(report)
