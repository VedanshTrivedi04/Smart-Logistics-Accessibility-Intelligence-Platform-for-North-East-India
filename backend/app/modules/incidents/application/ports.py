"""
app/modules/incidents/application/ports.py — Incident Repository Port.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Any
from uuid import UUID

from app.modules.incidents.domain.entities import (
    Incident,
    IncidentEdgeLink,
    IncidentMerge,
    OutboxEvent,
    ReviewDecision,
)
from app.modules.incidents.domain.enums import IncidentLifecycle
from app.modules.incidents.domain.recalculation import ActiveIncidentCondition


class IncidentRepositoryPort(ABC):
    """Abstract port for incident lifecycle management, adjudication decisions, and outbox."""

    @abstractmethod
    async def create_incident(
        self,
        incident: Incident,
        primary_report_id: UUID,
        affected_edges: list[tuple[UUID, str, bool]] | None = None,
    ) -> Incident:
        """Create an adjudicated incident and link primary report and affected edges."""
        ...

    @abstractmethod
    async def get_incident_by_id(self, incident_id: UUID) -> Incident | None:
        """Retrieve an incident by UUID."""
        ...

    @abstractmethod
    async def update_incident(self, incident: Incident) -> Incident:
        """Update incident lifecycle, resolution or reopen metadata."""
        ...

    @abstractmethod
    async def list_incidents(
        self,
        lifecycle: IncidentLifecycle | None = None,
        limit: int = 50,
        offset: int = 0,
    ) -> list[Incident]:
        """List incidents with filtering."""
        ...

    @abstractmethod
    async def create_review_decision(self, decision: ReviewDecision) -> ReviewDecision:
        """Persist an immutable verifier adjudication decision."""
        ...

    @abstractmethod
    async def get_review_decisions_for_report(self, report_id: UUID) -> list[ReviewDecision]:
        """List all review decisions for a given field report."""
        ...

    @abstractmethod
    async def record_incident_merge(self, merge: IncidentMerge) -> None:
        """Record an audit merge linking two incidents and re-parenting associations."""
        ...

    @abstractmethod
    async def get_active_incidents_for_edge(self, edge_id: UUID) -> list[ActiveIncidentCondition]:
        """Query all active/monitoring incident conditions affecting an edge."""
        ...

    @abstractmethod
    async def create_outbox_event(self, event: OutboxEvent) -> OutboxEvent:
        """Persist a domain event to the transactional outbox."""
        ...

    @abstractmethod
    async def get_pending_outbox_events(self, limit: int = 50) -> list[OutboxEvent]:
        """Retrieve pending outbox events for worker dispatch."""
        ...

    @abstractmethod
    async def mark_outbox_event_dispatched(self, event_id: UUID) -> None:
        """Mark outbox event as dispatched."""
        ...

    @abstractmethod
    async def mark_outbox_event_failed(
        self,
        event_id: UUID,
        error: str,
        is_dead_letter: bool = False,
    ) -> None:
        """Record dispatch retry failure or move to dead letter queue."""
        ...

    @abstractmethod
    async def record_consumer_receipt(self, consumer_id: str, event_id: UUID) -> bool:
        """
        Record receipt of processed outbox event by a downstream consumer.
        Returns True if newly recorded, False if already processed (idempotency guard).
        """
        ...
