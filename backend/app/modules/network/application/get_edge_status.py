"""
app/modules/network/application/get_edge_status.py — Use case for querying edge accessibility status with expiry evaluation.
"""

from __future__ import annotations

from datetime import datetime, timezone
from uuid import UUID

from app.modules.network.application.ports import EdgeStatusRepositoryPort
from app.modules.network.domain.entities import EdgeStatusCurrent
from app.modules.network.domain.enums import AccessibilityStatus, StatusFreshness
from app.modules.network.domain.exceptions import EdgeNotFoundError


class GetEdgeStatusUseCase:
    """Fetches live edge status, evaluating evidence expiry rules."""

    def __init__(self, edge_status_repo: EdgeStatusRepositoryPort) -> None:
        self.edge_status_repo = edge_status_repo

    async def execute(self, edge_id: UUID) -> EdgeStatusCurrent:
        current = await self.edge_status_repo.get_current_status(edge_id)
        if not current:
            raise EdgeNotFoundError(f"Edge {edge_id} has no status record")

        now = datetime.now(timezone.utc)

        # Evidence Expiry Rule (Systemdesign.md line 46):
        # On evidence expiry, show UNKNOWN and require review, never infer reopening.
        if current.expires_at and now > current.expires_at:
            return EdgeStatusCurrent(
                edge_id=current.edge_id,
                status_version=current.status_version,
                status=AccessibilityStatus.UNKNOWN,
                freshness=StatusFreshness.EXPIRED,
                effective_restrictions=current.effective_restrictions,
                source_event_id=current.source_event_id,
                last_verified_at=current.last_verified_at,
                expires_at=current.expires_at,
                updated_at=current.updated_at,
            )

        return current
