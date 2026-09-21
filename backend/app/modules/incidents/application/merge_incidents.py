"""
app/modules/incidents/application/merge_incidents.py — Incident Deduplication and Merging Use Case.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from uuid import UUID

from app.core.exceptions import ValidationError
from app.core.security import PrincipalContext
from app.modules.incidents.application.ports import IncidentRepositoryPort
from app.modules.incidents.domain.entities import Incident, IncidentMerge, OutboxEvent
from app.modules.incidents.domain.exceptions import (
    IncidentNotFoundError,
    MergeCycleError,
)


class MergeIncidentsUseCase:
    """Merges a duplicate incident into a primary target incident and audits the operation."""

    def __init__(self, incident_repo: IncidentRepositoryPort) -> None:
        self.incident_repo = incident_repo

    async def execute(
        self,
        principal: PrincipalContext,
        source_incident_id: UUID,
        target_incident_id: UUID,
        notes: str | None = None,
    ) -> Incident:
        if source_incident_id == target_incident_id:
            raise MergeCycleError("Cannot merge an incident into itself.")

        source = await self.incident_repo.get_incident_by_id(source_incident_id)
        if not source:
            raise IncidentNotFoundError(f"Source incident {source_incident_id} not found.")

        target = await self.incident_repo.get_incident_by_id(target_incident_id)
        if not target:
            raise IncidentNotFoundError(f"Target incident {target_incident_id} not found.")

        merge = IncidentMerge(
            id=uuid.uuid4(),
            source_incident_id=source_incident_id,
            target_incident_id=target_incident_id,
            merged_by=principal.user_id,
            notes=notes,
            merged_at=datetime.now(timezone.utc),
        )
        merge.validate()

        await self.incident_repo.record_incident_merge(merge)

        # Transactional outbox event
        outbox_evt = OutboxEvent(
            id=uuid.uuid4(),
            event_type="INCIDENT_MERGED",
            payload={
                "source_incident_id": str(source_incident_id),
                "target_incident_id": str(target_incident_id),
                "merged_by": str(principal.user_id),
            },
        )
        await self.incident_repo.create_outbox_event(outbox_evt)

        updated_target = await self.incident_repo.get_incident_by_id(target_incident_id)
        assert updated_target is not None
        return updated_target
