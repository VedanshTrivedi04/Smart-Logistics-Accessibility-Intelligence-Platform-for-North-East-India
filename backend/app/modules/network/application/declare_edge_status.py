"""
app/modules/network/application/declare_edge_status.py — Use case for recording road status decisions.
"""

from __future__ import annotations

import uuid
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


class DeclareEdgeStatusUseCase:
    """Records an authorized edge status decision to the append-only log and updates projection."""

    def __init__(
        self,
        edge_status_repo: EdgeStatusRepositoryPort,
        network_repo: NetworkRepositoryPort,
    ) -> None:
        self.edge_status_repo = edge_status_repo
        self.network_repo = network_repo

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

        return updated_current
