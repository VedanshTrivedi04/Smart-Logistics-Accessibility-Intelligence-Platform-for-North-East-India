"""
tests/integration/impact/test_incident_to_impact_worker.py — Integration tests for outbox event worker and impact evaluation.
"""

from __future__ import annotations

from datetime import datetime, timezone
import uuid

import pytest
from sqlalchemy import select, text

from app.core.db import AsyncSessionLocal
from app.modules.incidents.infrastructure.models import OutboxEventModel, OutboxReceiptModel
from app.workers.outbox_dispatcher import dispatch_outbox_batch


class TestOutboxDispatcherWorker:
    async def test_incident_verified_dispatches_to_impact_evaluator(self) -> None:
        async with AsyncSessionLocal() as session:
            # 1. Fetch an edge
            edge_res = await session.execute(text("SELECT id FROM road_edges LIMIT 1"))
            edge_id = edge_res.scalar_one()

            event_id = uuid.uuid4()
            event = OutboxEventModel(
                id=event_id,
                event_type="incident.verified",
                payload={
                    "incident_id": str(uuid.uuid4()),
                    "affected_edges": [str(edge_id)],
                    "severity": "CRITICAL",
                },
                status="PENDING",
                retry_count=0,
                max_retries=5,
                created_at=datetime.now(timezone.utc),
            )
            session.add(event)
            await session.commit()

            # 2. Run single batch of outbox dispatcher for impact_evaluator
            processed = await dispatch_outbox_batch(session, consumer_id="impact_evaluator", batch_size=10)
            assert processed >= 1

            # 3. Verify consumer receipt created
            receipt = await session.get(OutboxReceiptModel, ("impact_evaluator", event_id))
            assert receipt is not None
            assert receipt.status == "SUCCESS"
            assert receipt.error_message is None

    async def test_edge_status_updated_dispatches_to_impact_evaluator(self) -> None:
        async with AsyncSessionLocal() as session:
            edge_id = (await session.execute(text("SELECT id FROM road_edges LIMIT 1"))).scalar_one()
            event_id = uuid.uuid4()

            event = OutboxEventModel(
                id=event_id,
                event_type="edge_status.updated",
                payload={
                    "edge_id": str(edge_id),
                    "status": "BLOCKED",
                    "status_version": 2,
                },
                status="PENDING",
                retry_count=0,
                max_retries=5,
                created_at=datetime.now(timezone.utc),
            )
            session.add(event)
            await session.commit()

            processed = await dispatch_outbox_batch(session, consumer_id="impact_evaluator", batch_size=10)
            assert processed >= 1

            receipt = await session.get(OutboxReceiptModel, ("impact_evaluator", event_id))
            assert receipt is not None
            assert receipt.status == "SUCCESS"
