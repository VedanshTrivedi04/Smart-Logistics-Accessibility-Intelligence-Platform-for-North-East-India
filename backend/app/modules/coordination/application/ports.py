"""
app/modules/coordination/application/ports.py — Repository port for coordination.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from uuid import UUID

from app.modules.coordination.domain.entities import CoordinationAction, Jurisdiction
from app.modules.coordination.domain.enums import SubjectType


class CoordinationRepositoryPort(ABC):
    @abstractmethod
    async def add_action(self, action: CoordinationAction) -> None:
        ...

    @abstractmethod
    async def list_actions(
        self,
        *,
        subject_type: SubjectType | None,
        subject_ref: str | None,
        limit: int,
    ) -> list[CoordinationAction]:
        """Most recent `limit` actions matching the filters, in any order."""
        ...

    @abstractmethod
    async def get_jurisdiction(self, jurisdiction_id: UUID) -> Jurisdiction | None:
        ...

    @abstractmethod
    async def list_jurisdictions(self) -> list[Jurisdiction]:
        ...

    @abstractmethod
    async def incident_exists(self, incident_id: UUID) -> bool:
        ...
