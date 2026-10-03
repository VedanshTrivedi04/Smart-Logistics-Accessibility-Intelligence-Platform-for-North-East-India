"""
app/modules/network/application/declare_edge_status.py — Use case for recording road status decisions.
"""

from __future__ import annotations

import uuid
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any
from uuid import UUID

from app.modules.network.application.ports import (
    EdgeStatusRepositoryPort,
    NetworkRepositoryPort,
)
from app.modules.network.domain.entities import EdgeStatusCurrent, EdgeStatusEvent
from app.modules.network.domain.enums import (
    AccessibilityStatus,
    SourceEventType,
    StatusFreshness,
)
from app.modules.network.domain.exceptions import EdgeNotFoundError



@dataclass(frozen=True)
class EdgeStatusChangeNotification:
    """What changed, passed to whatever `on_status_changed` callback the caller supplied."""

    edge_id: UUID
    status: AccessibilityStatus
    status_version: int
    reason: str
    source_event_type: SourceEventType
    actor_user_id: UUID | None


def make_edge_status_outbox_notifier(incident_repo: Any) -> Callable[[EdgeStatusChangeNotification], Awaitable[None]]:
    """`on_status_changed` callback: publishes the outbox event the impact engine listens for."""
    from app.modules.incidents.domain.entities import OutboxEvent

    async def _notify(change: EdgeStatusChangeNotification) -> None:
        await incident_repo.create_outbox_event(
            OutboxEvent(
                id=uuid.uuid4(),
                event_type="edge_status.updated",
                payload={
                    "edge_id": str(change.edge_id),
                    "status": change.status.value,
                    "status_version": change.status_version,
                    "reason": change.reason,
                    "source_event_type": change.source_event_type.value,
                    "actor_user_id": str(change.actor_user_id) if change.actor_user_id else None,
                },
            )
        )

    return _notify


class DeclareEdgeStatusUseCase:
    """Records an authorized edge status decision to the append-only log and updates projection."""

    def __init__(
        self,
        edge_status_repo: EdgeStatusRepositoryPort,
        network_repo: NetworkRepositoryPort,
        on_status_changed: Callable[["EdgeStatusChangeNotification"], Awaitable[None]] | None = None,
    ) -> None:
        self.edge_status_repo = edge_status_repo
        self.network_repo = network_repo
        # Every caller of this use case (the direct road-status endpoint, an inspector's decision,
        # a future caller) needs the resulting change to reach the impact engine. That used to be done
        # by hand in one specific endpoint and forgotten everywhere else — this makes it impossible to
        # forget, by putting the notification here instead of in each call site.
        self.on_status_changed = on_status_changed

    async def execute(
        self,
        edge_id: UUID,
        status: AccessibilityStatus,
        reason: str,
        source_event_type: SourceEventType,
        actor_user_id: UUID | None = None,
        source_reference_id: UUID | None = None,
        restrictions: dict[str, Any] | None = None,
        valid_from: datetime | None = None,
        valid_until: datetime | None = None,
    ) -> EdgeStatusCurrent:
        # 1. Verify edge exists
        edge = await self.network_repo.get_edge_by_id(edge_id)
        if not edge:
            raise EdgeNotFoundError(f"Road edge {edge_id} does not exist")

        now = datetime.now(timezone.utc)
        effective_valid_from = valid_from or now

        # 2. Get existing current status or default
        existing_current = await self.edge_status_repo.get_current_status(edge_id)
        next_version = (existing_current.status_version + 1) if existing_current else 1

        # 3. Create immutable event
        event_id = uuid.uuid4()
        event = EdgeStatusEvent(
            id=event_id,
            edge_id=edge_id,
            status=status,
            restrictions=restrictions or {},
            reason=reason,
            source_event_type=source_event_type,
            source_reference_id=source_reference_id,
            actor_user_id=actor_user_id,
            valid_from=effective_valid_from,
            valid_until=valid_until,
            created_at=now,
        )

        # 4. Create updated projection
        updated_current = EdgeStatusCurrent(
            edge_id=edge_id,
            status_version=next_version,
            status=status,
            freshness=StatusFreshness.FRESH,
            effective_restrictions=restrictions or {},
            source_event_id=event_id,
            last_verified_at=now,
            expires_at=valid_until,
            updated_at=now,
        )

        # 5. Atomically commit both
        await self.edge_status_repo.append_status_event_and_update_current(event, updated_current)

        # 6. Tell whoever needs to know that this edge's status changed (e.g. publish an outbox
        # event so the impact/routing engine recalculates). Optional: some callers (tests, scripts)
        # have no such consumer to notify.
        if self.on_status_changed:
            await self.on_status_changed(
                EdgeStatusChangeNotification(
                    edge_id=edge_id,
                    status=status,
                    status_version=next_version,
                    reason=reason,
                    source_event_type=source_event_type,
                    actor_user_id=actor_user_id,
                )
            )

        return updated_current
