"""
app/modules/incidents/public.py — Public Facade for Incidents Module.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from uuid import UUID

from app.modules.incidents.application.ports import IncidentRepositoryPort
from app.modules.incidents.domain.entities import Incident
from app.modules.incidents.domain.recalculation import ActiveIncidentCondition


class IncidentsModulePort(ABC):
    """Public interface exposed by Incidents module to routing and impact engines."""

    @abstractmethod
    async def get_incident(self, incident_id: UUID) -> Incident | None:
        ...

    @abstractmethod
    async def get_active_conditions_for_edge(self, edge_id: UUID) -> list[ActiveIncidentCondition]:
        ...


class IncidentsModule(IncidentsModulePort):
    """Facade implementation wrapping Incidents repository."""

    def __init__(self, repo: IncidentRepositoryPort) -> None:
        self.repo = repo

    async def get_incident(self, incident_id: UUID) -> Incident | None:
        return await self.repo.get_incident_by_id(incident_id)

    async def get_active_conditions_for_edge(self, edge_id: UUID) -> list[ActiveIncidentCondition]:
        return await self.repo.get_active_incidents_for_edge(edge_id)
