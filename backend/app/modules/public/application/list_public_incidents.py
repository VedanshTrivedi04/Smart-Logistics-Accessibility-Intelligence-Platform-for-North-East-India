"""
app/modules/public/application/list_public_incidents.py — Redacted, anonymous-safe
incident listing for the public citizen map.

Drops everything the authenticated view exposes about who reported an incident or
which organization is handling it, and rounds location to ~1.1 km so a marker can
be placed on a regional map without pinpointing a reporter's exact position.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from uuid import UUID

from app.modules.incidents.application.ports import IncidentRepositoryPort
from app.modules.incidents.domain.enums import IncidentLifecycle
from app.modules.reporting.application.ports import ReportingRepositoryPort

LOCATION_ROUNDING_DECIMALS = 2  # ~1.1 km at NER latitudes


@dataclass(frozen=True)
class PublicIncidentSummary:
    id: UUID
    title: str
    severity: str
    lifecycle: str
    approx_lat: float
    approx_lon: float
    created_at: datetime


class ListPublicIncidentsUseCase:
    def __init__(
        self, incident_repo: IncidentRepositoryPort, reporting_repo: ReportingRepositoryPort
    ) -> None:
        self.incident_repo = incident_repo
        self.reporting_repo = reporting_repo

    async def execute(self, limit: int = 100) -> list[PublicIncidentSummary]:
        incidents = await self.incident_repo.list_incidents(
            lifecycle=IncidentLifecycle.ACTIVE, limit=limit
        )
        summaries: list[PublicIncidentSummary] = []
        for incident in incidents:
            report = await self.reporting_repo.get_report_by_id(incident.primary_report_id)
            if report is None:
                # A report that no longer resolves is not placeable on a map; skip
                # it rather than guessing a location.
                continue
            summaries.append(
                PublicIncidentSummary(
                    id=incident.id,
                    title=incident.title or "Incident",
                    severity=incident.severity.value,
                    lifecycle=incident.lifecycle.value,
                    approx_lat=round(report.location.latitude, LOCATION_ROUNDING_DECIMALS),
                    approx_lon=round(report.location.longitude, LOCATION_ROUNDING_DECIMALS),
                    created_at=incident.created_at,
                )
            )
        return summaries
