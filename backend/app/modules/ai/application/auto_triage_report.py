"""
app/modules/ai/application/auto_triage_report.py — Use case for CV-based field report
auto-triage: fetches a submitted report's already-uploaded photo, verifies it, and
writes the result back to the reporting module.
"""

from __future__ import annotations

from uuid import UUID

from app.core.storage import ObjectStoragePort
from app.modules.ai.application.ports import HazardVerifierPort
from app.modules.ai.domain.entities import HazardVerification
from app.modules.ai.domain.exceptions import InvalidFeatureVectorError
from app.modules.reporting.public import ReportingModulePort


class AutoTriageFieldReportUseCase:
    """
    Orchestrates: fetch a field report's verifiable (scan-clean) media ->
    download its bytes -> run CV hazard verification -> record the result on
    the report via ReportingModulePort.apply_cv_verification(), which decides
    on Reporting's own terms whether to auto-escalate for review.
    """

    def __init__(
        self,
        hazard_verifier: HazardVerifierPort,
        reporting: ReportingModulePort,
        object_storage: ObjectStoragePort,
    ) -> None:
        self.hazard_verifier = hazard_verifier
        self.reporting = reporting
        self.object_storage = object_storage

    async def execute(self, report_id: UUID) -> HazardVerification:
        report = await self.reporting.get_report(report_id)
        if report is None:
            raise InvalidFeatureVectorError(f"Report {report_id} not found")

        media = await self.reporting.get_verifiable_media(report_id)
        if media is None:
            raise InvalidFeatureVectorError(
                f"Report {report_id} has no scan-clean media available for CV verification"
            )

        image_bytes = await self.object_storage.get_object(media.bucket, media.object_key)
        verification = await self.hazard_verifier.verify(image_bytes)

        await self.reporting.apply_cv_verification(
            report_id=report_id,
            hazard_class=verification.hazard_class.value,
            severity_score=verification.severity_score,
            confidence=verification.confidence,
            is_roadway_blocked=verification.is_roadway_blocked,
        )

        return verification
