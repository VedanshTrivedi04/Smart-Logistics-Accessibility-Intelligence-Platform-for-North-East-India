"""
app/modules/incidents/application/resolve_incident.py — Safe Incident Resolution & Edge Recalculation Use Case.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any
from uuid import UUID

from app.core.exceptions import ForbiddenError, ValidationError
from app.core.security import PrincipalContext
from app.modules.incidents.application.ports import IncidentRepositoryPort
from app.modules.incidents.domain.entities import Incident, OutboxEvent
from app.modules.incidents.domain.enums import IncidentLifecycle, ResolutionReason
from app.modules.incidents.domain.exceptions import IncidentNotFoundError
from app.modules.incidents.domain.recalculation import recalculate_effective_edge_status
from app.modules.network.application.declare_edge_status import DeclareEdgeStatusUseCase
from app.modules.network.domain.enums import AccessibilityStatus, SourceEventType


class ResolveIncidentUseCase:
    """
    Resolves an operational incident and recalculates affected road edges.
    Enforces Policy 7 & 8: Never naively sets road to OPEN; queries all remaining
    active incidents and active restrictions to determine effective traversability.
    """

    def __init__(
        self,
        incident_repo: IncidentRepositoryPort,
        declare_status_use_case: DeclareEdgeStatusUseCase | None = None,
    ) -> None:
        self.incident_repo = incident_repo
        self.declare_status_use_case = declare_status_use_case

    async def execute(
        self,
        principal: PrincipalContext,
        incident_id: UUID,
        reason: ResolutionReason,
        notes: str | None = None,
        affected_edge_ids: list[UUID] | None = None,
    ) -> Incident:
        incident = await self.incident_repo.get_incident_by_id(incident_id)
        if not incident:
            raise IncidentNotFoundError(f"Incident {incident_id} not found.")

        # Resolve incident entity
        incident.resolve(
            resolver_id=principal.user_id,
            reason=reason,
            notes=notes,
            resolved_at=datetime.now(timezone.utc),
        )
        await self.incident_repo.update_incident(incident)

        # Policy 7: Safe Edge-State Recalculation
        if self.declare_status_use_case and affected_edge_ids:
            for edge_id in affected_edge_ids:
                # Query all other active incidents on this edge
                active_conditions = await self.incident_repo.get_active_incidents_for_edge(edge_id)
                # Recalculate combined effective status
                effective_status, restrictions = recalculate_effective_edge_status(
                    edge_id=edge_id,
                    active_incidents=active_conditions,
                )

                await self.declare_status_use_case.execute(
                    edge_id=edge_id,
                    status=effective_status,
                    reason=f"Edge re-evaluated upon resolution of incident {incident.id}: {reason.value}",
                    source_event_type=SourceEventType.OFFICIAL_DECISION,
                    actor_user_id=principal.user_id,
                    source_reference_id=incident.id,
                )

        # Create transactional outbox event
        outbox_evt = OutboxEvent(
            id=uuid.uuid4(),
            event_type="INCIDENT_RESOLVED",
            payload={
                "incident_id": str(incident.id),
                "resolution_reason": reason.value,
                "resolved_by": str(principal.user_id),
                "recalculated_edges": [str(e) for e in (affected_edge_ids or [])],
            },
        )
        await self.incident_repo.create_outbox_event(outbox_evt)

        return incident
