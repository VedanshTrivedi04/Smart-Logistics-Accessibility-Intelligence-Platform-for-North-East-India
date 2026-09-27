"""
app/modules/inspection/application/ports.py — Repository Ports for Inspection Module.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from uuid import UUID

from app.modules.inspection.domain.entities import Inspection, InspectionEvidence, InspectorSummary
from app.modules.inspection.domain.enums import InspectionStatus


class InspectionRepositoryPort(ABC):
    """Abstract persistence interface for inspection operations."""

    @abstractmethod
    async def create_inspection(self, inspection: Inspection) -> Inspection:
        ...

    @abstractmethod
    async def get_inspection_by_id(self, inspection_id: UUID) -> Inspection | None:
        ...

    @abstractmethod
    async def update_inspection(self, inspection: Inspection) -> Inspection:
        ...

    @abstractmethod
    async def list_inspections(
        self,
        *,
        assigned_to: UUID | None = None,
        jurisdiction_id: UUID | None = None,
        status: InspectionStatus | None = None,
        edge_id: str | None = None,
        limit: int = 50,
        offset: int = 0,
    ) -> list[Inspection]:
        ...

    @abstractmethod
    async def count_by_status(self, *, assigned_to: UUID | None = None) -> dict[str, int]:
        ...

    @abstractmethod
    async def add_evidence(self, evidence: InspectionEvidence) -> InspectionEvidence:
        ...

    @abstractmethod
    async def get_latest_inspection_for_edge(self, edge_id: str) -> Inspection | None:
        ...

    @abstractmethod
    async def list_available_inspectors(self) -> list[InspectorSummary]:
        """Users holding a role that can be assigned an inspection task, for the assignment picker."""
        ...
