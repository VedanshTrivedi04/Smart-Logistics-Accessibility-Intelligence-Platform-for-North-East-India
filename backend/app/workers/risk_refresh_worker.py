"""
app/workers/risk_refresh_worker.py — Periodic AI Risk Refresh & Route Invalidation Worker.

Every DEFAULT_POLL_INTERVAL_SECONDS (30 min, per aiml developer.md Phase 4):
  1. Find every edge with recent weather-feature observations.
  2. Re-score each with PredictEdgeRiskUseCase (Phase 3's real/stub inference).
  3. Escalate the edge's accessibility status (never de-escalate — matches
     the existing "never infer reopening" evidence-expiry rule in
     network/application/get_edge_status.py) when predicted risk crosses
     BLOCKED_THRESHOLD / RESTRICTED_THRESHOLD, via network's own
     DeclareEdgeStatusUseCase (SourceEventType.WEATHER_HAZARD).
  4. Write an "edge_status.updated" outbox event, matching the payload shape
     app/workers/outbox_dispatcher.py's impact-evaluator consumer already
     understands — this is how a risk escalation propagates into disruption
     impact assessment and (transitively) route invalidation, reusing the
     existing, already-wired outbox consumer path rather than adding a new one.

Follows this repo's actual worker convention (a plain asyncio polling loop,
run as `python -m app.workers.risk_refresh_worker`) — matching
outbox_dispatcher.py — rather than inventing Celery task infrastructure that
does not otherwise exist in this codebase yet.
"""

from __future__ import annotations

import asyncio
import logging
from datetime import UTC, datetime, timedelta
from uuid import UUID, uuid4

from sqlalchemy import select

from app.core.db import AsyncSessionLocal, DbSession
from app.modules.ai.domain.enums import RiskHorizon
from app.modules.ai.infrastructure.feature_store_repository import (
    SqlAlchemyFeatureStoreRepository,
)
from app.modules.ai.infrastructure.models import EdgeWeatherFeaturesModel
from app.modules.ai.infrastructure.xgboost_risk_predictor import get_risk_predictor
from app.modules.ai.public import PredictEdgeRiskUseCase
from app.modules.incidents.infrastructure.models import OutboxEventModel
from app.modules.network.application.declare_edge_status import DeclareEdgeStatusUseCase
from app.modules.network.domain.enums import AccessibilityStatus, SourceEventType
from app.modules.network.infrastructure.repository import SqlAlchemyNetworkRepository

logger = logging.getLogger(__name__)

DEFAULT_POLL_INTERVAL_SECONDS = 30 * 60

# How fresh a weather observation must be for its edge to be worth re-scoring.
WEATHER_FRESHNESS_WINDOW_HOURS = 48

# Two-tier risk -> accessibility status mapping. Deliberately one-directional:
# only escalation is auto-declared; de-escalation always requires human review.
# Thresholds apply to the raw decision score (see RiskAssessment.decision_score).
BLOCKED_THRESHOLD = 0.75
RESTRICTED_THRESHOLD = 0.40

REFRESH_HORIZON = RiskHorizon.H24

_STATUS_SEVERITY = {
    AccessibilityStatus.OPEN: 0,
    AccessibilityStatus.RESTRICTED: 1,
    AccessibilityStatus.BLOCKED: 2,
}


async def _edges_with_recent_weather(session: DbSession, within_hours: int) -> list[UUID]:
    cutoff = datetime.now(UTC) - timedelta(hours=within_hours)
    stmt = (
        select(EdgeWeatherFeaturesModel.edge_id)
        .where(EdgeWeatherFeaturesModel.observed_at >= cutoff)
        .distinct()
    )
    result = await session.execute(stmt)
    return [row[0] for row in result.all()]


def status_for_probability(probability: float) -> AccessibilityStatus | None:
    """Pure mapping from a risk probability to an escalation target, or None."""
    if probability >= BLOCKED_THRESHOLD:
        return AccessibilityStatus.BLOCKED
    if probability >= RESTRICTED_THRESHOLD:
        return AccessibilityStatus.RESTRICTED
    return None


async def refresh_edge_risks(session: DbSession, horizon: RiskHorizon = REFRESH_HORIZON) -> int:
    """
    Runs one refresh pass. Returns the number of edges whose accessibility
    status was escalated (and therefore had an outbox event written).
    """
    feature_store = SqlAlchemyFeatureStoreRepository(session)
    network_repo = SqlAlchemyNetworkRepository(session)
    risk_use_case = PredictEdgeRiskUseCase(
        risk_predictor=get_risk_predictor(), feature_store=feature_store
    )
    declare_use_case = DeclareEdgeStatusUseCase(
        edge_status_repo=network_repo, network_repo=network_repo
    )

    edge_ids = await _edges_with_recent_weather(session, WEATHER_FRESHNESS_WINDOW_HOURS)
    escalated_count = 0

    for edge_id in edge_ids:
        try:
            assessment = await risk_use_case.execute(edge_id=edge_id, horizon=horizon)
        except Exception:
            logger.exception("risk_refresh_prediction_failed edge_id=%s", edge_id)
            continue

        new_status = status_for_probability(assessment.decision_score)
        if new_status is None:
            continue

        current = await network_repo.get_current_status(edge_id)
        current_severity = _STATUS_SEVERITY.get(current.status, -1) if current else -1
        if _STATUS_SEVERITY[new_status] <= current_severity:
            continue  # Already at least as severe — avoid a redundant re-declaration.

        updated = await declare_use_case.execute(
            edge_id=edge_id,
            status=new_status,
            reason=(
                f"AI-predicted disruption risk {assessment.probability:.0%} "
                f"within {horizon.value} horizon"
            ),
            source_event_type=SourceEventType.WEATHER_HAZARD,
            actor_user_id=None,
        )

        session.add(
            OutboxEventModel(
                id=uuid4(),
                event_type="edge_status.updated",
                payload={
                    "edge_id": str(edge_id),
                    "status": updated.status.value,
                    "status_version": updated.status_version,
                },
            )
        )
        escalated_count += 1

    await session.commit()
    return escalated_count


async def run_risk_refresh_worker(poll_interval: float = DEFAULT_POLL_INTERVAL_SECONDS) -> None:
    """Continuously refreshes edge risk scores on a fixed interval."""
    logger.info("Starting risk refresh worker (interval=%.0fs)...", poll_interval)
    while True:
        try:
            async with AsyncSessionLocal() as session:
                count = await refresh_edge_risks(session)
                if count > 0:
                    logger.info("Risk refresh escalated %d edge(s)", count)
        except Exception:
            logger.exception("Unexpected error in risk refresh worker loop")

        await asyncio.sleep(poll_interval)


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    asyncio.run(run_risk_refresh_worker())
