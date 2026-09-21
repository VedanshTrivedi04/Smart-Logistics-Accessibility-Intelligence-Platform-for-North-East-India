"""
tests/integration/network/test_edge_status_lifecycle.py — Integration tests for edge status lifecycle and append-only trigger.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import AsyncSessionLocal
from app.modules.network.application.declare_edge_status import DeclareEdgeStatusUseCase
from app.modules.network.application.get_edge_status import GetEdgeStatusUseCase
from app.modules.network.domain.enums import (
    AccessibilityStatus,
    SourceEventType,
    StatusFreshness,
)
from app.modules.network.domain.exceptions import EdgeNotFoundError
from app.modules.network.infrastructure.models import EdgeStatusEventModel, RoadEdgeModel
from app.modules.network.infrastructure.repository import SqlAlchemyNetworkRepository


@pytest.fixture
async def sample_edge_id() -> uuid.UUID:
    """Fetch an existing edge from the seeded pilot corridor."""
    async with AsyncSessionLocal() as session:
        res = await session.execute(text("SELECT id FROM road_edges LIMIT 1"))
        row = res.first()
        if not row:
            pytest.skip("No road edges found in database — seed pilot corridor first")
        return row[0]


class TestEdgeStatusLifecycle:
    async def test_declare_edge_status_creates_event_and_updates_projection(self, sample_edge_id: uuid.UUID) -> None:
        async with AsyncSessionLocal() as session:
            repo = SqlAlchemyNetworkRepository(session)
            use_case = DeclareEdgeStatusUseCase(edge_status_repo=repo, network_repo=repo)

            result = await use_case.execute(
                edge_id=sample_edge_id,
                status=AccessibilityStatus.BLOCKED,
                reason="Severe monsoon landslide near Nongpoh",
                source_event_type=SourceEventType.OFFICIAL_DECISION,
                restrictions={"hazard": "LANDSLIDE"},
            )
            await session.commit()

            assert result.edge_id == sample_edge_id
            assert result.status == AccessibilityStatus.BLOCKED
            assert result.freshness == StatusFreshness.FRESH
            assert result.status_version >= 2

            # Verify in DB projection
            curr = await repo.get_current_status(sample_edge_id)
            assert curr is not None
            assert curr.status == AccessibilityStatus.BLOCKED

            # Verify in DB event log
            history = await repo.get_status_history(sample_edge_id, limit=5)
            assert len(history) >= 1
            assert history[0].status == AccessibilityStatus.BLOCKED
            assert "landslide" in history[0].reason.lower()

    async def test_append_only_trigger_blocks_direct_update(self, sample_edge_id: uuid.UUID) -> None:
        """Verifies DB trigger prevent_edge_status_events_mutation blocks UPDATE."""
        async with AsyncSessionLocal() as session:
            # Find an event ID
            res = await session.execute(
                text("SELECT id FROM edge_status_events WHERE edge_id = :edge_id LIMIT 1"),
                {"edge_id": sample_edge_id},
            )
            row = res.first()
            if not row:
                pytest.skip("No events found for edge")

            event_id = row[0]

            with pytest.raises(Exception) as exc_info:
                await session.execute(
                    text("UPDATE edge_status_events SET reason = 'Tampered reason' WHERE id = :id"),
                    {"id": event_id},
                )
            assert "append-only" in str(exc_info.value).lower()
            await session.rollback()

    async def test_append_only_trigger_blocks_direct_delete(self, sample_edge_id: uuid.UUID) -> None:
        """Verifies DB trigger prevent_edge_status_events_mutation blocks DELETE."""
        async with AsyncSessionLocal() as session:
            res = await session.execute(
                text("SELECT id FROM edge_status_events WHERE edge_id = :edge_id LIMIT 1"),
                {"edge_id": sample_edge_id},
            )
            row = res.first()
            if not row:
                pytest.skip("No events found for edge")

            event_id = row[0]

            with pytest.raises(Exception) as exc_info:
                await session.execute(
                    text("DELETE FROM edge_status_events WHERE id = :id"),
                    {"id": event_id},
                )
            assert "append-only" in str(exc_info.value).lower()
            await session.rollback()

    async def test_expired_status_evaluates_to_unknown(self, sample_edge_id: uuid.UUID) -> None:
        """Systemdesign.md line 46: On evidence expiry, show UNKNOWN and require review, never infer reopening."""
        async with AsyncSessionLocal() as session:
            repo = SqlAlchemyNetworkRepository(session)
            use_case = DeclareEdgeStatusUseCase(edge_status_repo=repo, network_repo=repo)

            past_time = datetime.now(timezone.utc) - timedelta(hours=2)
            await use_case.execute(
                edge_id=sample_edge_id,
                status=AccessibilityStatus.RESTRICTED,
                reason="Temporary flood alert",
                source_event_type=SourceEventType.OFFICIAL_DECISION,
                valid_until=past_time,
            )
            await session.commit()

            # Query through use case
            status_uc = GetEdgeStatusUseCase(repo)
            status_result = await status_uc.execute(sample_edge_id)

            assert status_result.status == AccessibilityStatus.UNKNOWN
            assert status_result.freshness == StatusFreshness.EXPIRED
