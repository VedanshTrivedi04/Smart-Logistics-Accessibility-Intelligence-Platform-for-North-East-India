"""
app/modules/reporting/public.py — Public Facade for Reporting Module.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from uuid import UUID

from app.modules.reporting.application.ports import ReportingRepositoryPort
from app.modules.reporting.domain.entities import FieldReport


class ReportingModulePort(ABC):
    """Public interface exposed by the Reporting module to other modules."""

    @abstractmethod
    async def get_report(self, report_id: UUID) -> FieldReport | None:
        ...


class ReportingModule(ReportingModulePort):
    """Facade implementation wrapping Reporting repository."""

    def __init__(self, repo: ReportingRepositoryPort) -> None:
        self.repo = repo

    async def get_report(self, report_id: UUID) -> FieldReport | None:
        return await self.repo.get_report_by_id(report_id)
