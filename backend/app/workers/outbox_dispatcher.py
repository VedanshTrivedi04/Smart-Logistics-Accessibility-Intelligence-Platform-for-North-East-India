"""
app/workers/outbox_dispatcher.py — Multi-Consumer Outbox Event Dispatcher Worker.

Implements polling with SELECT ... FOR UPDATE SKIP LOCKED, independent per-consumer
receipt tracking in `outbox_consumer_receipts`, exponential backoff, and dead-lettering.
"""

from __future__ import annotations

import asyncio
from datetime import datetime, timedelta, timezone
import logging
from typing import Any
import uuid

import sqlalchemy as sa

from app.core.db import AsyncSessionLocal, DbSession
from app.modules.impact.domain.enums import ImpactSeverity, ImpactType
from app.modules.impact.public import (
    EvaluateDisruptionImpactUseCase,
    SqlAlchemyImpactRepository,
)
from app.modules.incidents.infrastructure.models import OutboxEventModel, OutboxReceiptModel
from app.modules.network.infrastructure.repository import SqlAlchemyNetworkRepository

logger = logging.getLogger(__name__)

BACKOFF_SECONDS = [5, 15, 30, 60, 300]
MAX_RETRIES = 5


async def _handle_impact_evaluator_event(
    session: DbSession,
    event: OutboxEventModel,
) -> None:
    """Dispatches event to Disruption Impact Evaluator."""
    impact_repo = SqlAlchemyImpactRepository(session)
    network_repo = SqlAlchemyNetworkRepository(session)
    use_case = EvaluateDisruptionImpactUseCase(impact_repo)

    payload = event.payload or {}
    event_type = event.event_type

    global_status_version = await network_repo.get_global_status_version()

    if event_type in ("incident.verified", "incident.created"):
        incident_id_str = payload.get("incident_id")
        incident_id = uuid.UUID(incident_id_str) if incident_id_str else None

        edges = payload.get("affected_edges") or []
        if not edges and "edge_id" in payload:
            edges = [payload["edge_id"]]

        sev_str = str(payload.get("severity", "HIGH")).upper()
        severity = ImpactSeverity.CRITICAL if sev_str in ("CRITICAL", "HIGH") else ImpactSeverity.MODERATE

        for edge_item in edges:
            edge_id = uuid.UUID(edge_item) if isinstance(edge_item, str) else edge_item
            await use_case.execute(
                edge_id=edge_id,
                source_status_version=global_status_version,
                source_event_id=event.id,
                incident_id=incident_id,
                impact_type=ImpactType.BLOCKED_ROUTE,
                severity=severity,
                delay_estimated_seconds=1800,
            )

    elif event_type == "edge_status.updated":
        edge_id_str = payload.get("edge_id")
        if not edge_id_str:
            return
        edge_id = uuid.UUID(edge_id_str) if isinstance(edge_id_str, str) else edge_id_str
        status = str(payload.get("status", "")).upper()
        status_version = int(payload.get("status_version", global_status_version))

        if status in ("BLOCKED", "IMPASSABLE"):
            await use_case.execute(
                edge_id=edge_id,
                source_status_version=status_version,
                source_event_id=event.id,
                impact_type=ImpactType.BLOCKED_ROUTE,
                severity=ImpactSeverity.CRITICAL,
                delay_estimated_seconds=3600,
            )
        elif status == "RESTRICTED":
            await use_case.execute(
                edge_id=edge_id,
                source_status_version=status_version,
                source_event_id=event.id,
                impact_type=ImpactType.RESTRICTED_DELAY,
                severity=ImpactSeverity.HIGH,
                delay_estimated_seconds=1800,
            )


async def dispatch_outbox_batch(
    session: DbSession,
    consumer_id: str = "impact_evaluator",
    batch_size: int = 10,
) -> int:
    """
    Polls and dispatches a single batch of events for the specified consumer.
    Uses SELECT ... FOR UPDATE SKIP LOCKED for high-concurrency safety.
    """
    now = datetime.now(timezone.utc)

    # Subquery checking whether this specific consumer has already successfully processed the event
    receipt_subquery = sa.select(1).where(
        OutboxReceiptModel.event_id == OutboxEventModel.id,
        OutboxReceiptModel.consumer_id == consumer_id,
        OutboxReceiptModel.status == "SUCCESS",
    )

    query = (
        sa.select(OutboxEventModel)
        .where(
            OutboxEventModel.dead_lettered_at.is_(None),
            sa.or_(
                OutboxEventModel.next_attempt_at.is_(None),
                OutboxEventModel.next_attempt_at <= now,
            ),
            ~sa.exists(receipt_subquery),
        )
        .order_by(OutboxEventModel.created_at.asc())
        .limit(batch_size)
        .with_for_update(skip_locked=True)
    )

    result = await session.execute(query)
    events = result.scalars().all()

    processed_count = 0

    for event in events:
        try:
            async with session.begin_nested():
                if consumer_id == "impact_evaluator":
                    await _handle_impact_evaluator_event(session, event)

                # Record success receipt
                receipt = await session.get(OutboxReceiptModel, (consumer_id, event.id))
                if receipt:
                    receipt.status = "SUCCESS"
                    receipt.error_message = None
                    receipt.processed_at = now
                else:
                    receipt = OutboxReceiptModel(
                        consumer_id=consumer_id,
                        event_id=event.id,
                        status="SUCCESS",
                        error_message=None,
                        processed_at=now,
                    )
                    session.add(receipt)

                event.dispatched_at = now
                event.status = "DISPATCHED"

            await session.commit()
            processed_count += 1

        except Exception as exc:
            logger.exception("Failed to process outbox event %s for consumer %s: %s", event.id, consumer_id, exc)

            event.retry_count += 1
            event.last_error = str(exc)

            if event.retry_count >= event.max_retries:
                event.dead_lettered_at = now
                event.status = "FAILED"
                event.failed_at = now
                logger.error("Outbox event %s dead-lettered after %d attempts", event.id, event.retry_count)
            else:
                backoff = BACKOFF_SECONDS[min(event.retry_count - 1, len(BACKOFF_SECONDS) - 1)]
                event.next_attempt_at = now + timedelta(seconds=backoff)

            # Record failure receipt
            receipt = await session.get(OutboxReceiptModel, (consumer_id, event.id))
            if receipt:
                receipt.status = "FAILED"
                receipt.error_message = str(exc)
                receipt.processed_at = now
            else:
                receipt = OutboxReceiptModel(
                    consumer_id=consumer_id,
                    event_id=event.id,
                    status="FAILED",
                    error_message=str(exc),
                    processed_at=now,
                )
                session.add(receipt)

            await session.commit()

    return processed_count


async def run_outbox_worker(
    poll_interval: float = 2.0,
    consumer_id: str = "impact_evaluator",
) -> None:
    """Continuously polls outbox for incoming events."""
    logger.info("Starting outbox worker for consumer '%s'...", consumer_id)
    while True:
        try:
            async with AsyncSessionLocal() as session:
                count = await dispatch_outbox_batch(session, consumer_id=consumer_id)
                if count > 0:
                    logger.info("Consumer '%s' dispatched %d events", consumer_id, count)
        except Exception as exc:
            logger.exception("Unexpected error in outbox worker loop: %s", exc)

        await asyncio.sleep(poll_interval)


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    asyncio.run(run_outbox_worker())
