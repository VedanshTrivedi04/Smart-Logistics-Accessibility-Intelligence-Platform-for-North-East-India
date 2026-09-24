"""
app/modules/reporting/public.py — Public Facade for Reporting Module.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from uuid import UUID

from app.modules.reporting.application.apply_cv_verification import ApplyCvVerificationUseCase
from app.modules.reporting.application.ports import ReportingRepositoryPort
from app.modules.reporting.domain.entities import FieldReport, MediaObject
from app.modules.reporting.domain.enums import ScanStatus

__all__ = [
    "FieldReport",
    "MediaObject",
    "ReportingModule",
    "ReportingModulePort",
]


class ReportingModulePort(ABC):
    """Public interface exposed by the Reporting module to other modules."""

    @abstractmethod
    async def get_report(self, report_id: UUID) -> FieldReport | None:
        ...

    @abstractmethod
    async def get_verifiable_media(self, report_id: UUID) -> MediaObject | None:
        """
        Return the report's primary media object, but ONLY if it has passed
        quarantine scanning (ScanStatus.CLEAN) — this business rule stays
        inside Reporting rather than leaking ScanStatus checks into callers.
        Returns None if there is no media, or it hasn't cleared scanning yet.
        """
        ...

    @abstractmethod
    async def apply_cv_verification(
        self,
        report_id: UUID,
        hazard_class: str,
        severity_score: float,
        confidence: float,
        is_roadway_blocked: bool,
    ) -> FieldReport:
        """Record an AI/ML CV hazard-verification result against a report."""
        ...


class ReportingModule(ReportingModulePort):
    """Facade implementation wrapping Reporting repository."""

    def __init__(self, repo: ReportingRepositoryPort) -> None:
        self.repo = repo

    async def get_report(self, report_id: UUID) -> FieldReport | None:
        return await self.repo.get_report_by_id(report_id)

    async def get_verifiable_media(self, report_id: UUID) -> MediaObject | None:
        report = await self.repo.get_report_by_id(report_id)
        if not report or not report.media_ids:
            return None
        media = await self.repo.get_media_by_id(report.media_ids[0])
        if not media or media.scan_status != ScanStatus.CLEAN:
            return None
        return media

    async def apply_cv_verification(
        self,
        report_id: UUID,
        hazard_class: str,
        severity_score: float,
        confidence: float,
        is_roadway_blocked: bool,
    ) -> FieldReport:
        use_case = ApplyCvVerificationUseCase(self.repo)
        return await use_case.execute(
            report_id=report_id,
            hazard_class=hazard_class,
            severity_score=severity_score,
            confidence=confidence,
            is_roadway_blocked=is_roadway_blocked,
        )
