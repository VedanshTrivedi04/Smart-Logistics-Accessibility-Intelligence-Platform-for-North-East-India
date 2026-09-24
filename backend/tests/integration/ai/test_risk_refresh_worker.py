"""
tests/integration/ai/test_risk_refresh_worker.py — Integration tests for the Phase 4
periodic risk-refresh worker (requires a live database with the pilot corridor seeded).

NOTE: These tests need the real synthetic-trained risk model artifact present
at backend/app/modules/ai/infrastructure/models/risk_model_xgboost.pkl (copy
from ml-training/models/, see that directory's README) — if it's missing,
get_risk_predictor() falls back to the fixed-probability stub and the
"escalates on high risk" test below will fail (the stub always predicts 0.1,
below RESTRICTED_THRESHOLD), which is a signal to copy the artifact in rather
than a bug in the worker.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime

import pytest
from sqlalchemy import text

from app.core.db import AsyncSessionLocal
from app.modules.ai.domain.entities import TerrainFeatures, WeatherFeatures
from app.modules.ai.domain.enums import SusceptibilityZone
from app.modules.ai.infrastructure.feature_store_repository import (
    SqlAlchemyFeatureStoreRepository,
)
from app.modules.network.domain.enums import AccessibilityStatus
from app.modules.network.infrastructure.repository import SqlAlchemyNetworkRepository
from app.workers.risk_refresh_worker import refresh_edge_risks


@pytest.fixture
async def sample_edge_id() -> uuid.UUID:
    """Fetch an existing edge from the seeded pilot corridor."""
    async with AsyncSessionLocal() as session:
        res = await session.execute(text("SELECT id FROM road_edges LIMIT 1"))
        row = res.first()
        if not row:
            pytest.skip("No road edges found in database — seed pilot corridor first")
        return row[0]


async def _seed_features(edge_id: uuid.UUID, *, high_risk: bool) -> None:
    now = datetime.now(UTC)
    async with AsyncSessionLocal() as session:
        repo = SqlAlchemyFeatureStoreRepository(session)
        await repo.save_terrain_features(
            [
                TerrainFeatures(
                    edge_id=edge_id,
                    elevation_min_m=800.0,
                    elevation_max_m=1200.0,
                    elevation_mean_m=1200.0 if high_risk else 400.0,
                    slope_pct=40.0 if high_risk else 3.0,
                    aspect_deg=90.0,
                    curvature_index=2.0 if high_risk else 1.05,
                    susceptibility_zone=(
                        SusceptibilityZone.VERY_HIGH if high_risk else SusceptibilityZone.LOW
                    ),
                    distance_to_stream_m=50.0 if high_risk else 2000.0,
                    computed_at=now,
                )
            ]
        )
        await repo.save_weather_features(
            [
                WeatherFeatures(
                    edge_id=edge_id,
                    observed_at=now,
                    rainfall_24h_mm=300.0 if high_risk else 0.0,
                    rainfall_48h_mm=300.0 if high_risk else 0.0,
                    rainfall_72h_mm=300.0 if high_risk else 0.0,
                    ari_score=150.0 if high_risk else 0.0,
                    forecast_rainfall_3h_mm=20.0 if high_risk else 0.0,
                    forecast_rainfall_6h_mm=30.0 if high_risk else 0.0,
                    forecast_rainfall_12h_mm=40.0 if high_risk else 0.0,
                    soil_moisture_index=0.9 if high_risk else 0.1,
                )
            ]
        )
        await session.commit()


class TestRiskRefreshWorker:
    async def test_escalates_status_for_high_risk_edge(self, sample_edge_id: uuid.UUID) -> None:
        await _seed_features(sample_edge_id, high_risk=True)

        async with AsyncSessionLocal() as session:
            escalated = await refresh_edge_risks(session)
            assert escalated >= 1

        async with AsyncSessionLocal() as session:
            network_repo = SqlAlchemyNetworkRepository(session)
            current = await network_repo.get_current_status(sample_edge_id)
            assert current is not None
            assert current.status in (AccessibilityStatus.RESTRICTED, AccessibilityStatus.BLOCKED)

            outbox_count = await session.execute(
                text(
                    "SELECT count(*) FROM outbox_events WHERE event_type = 'edge_status.updated' "
                    "AND payload->>'edge_id' = :edge_id"
                ),
                {"edge_id": str(sample_edge_id)},
            )
            assert outbox_count.scalar_one() >= 1

    async def test_does_not_escalate_for_low_risk_edge(self, sample_edge_id: uuid.UUID) -> None:
        await _seed_features(sample_edge_id, high_risk=False)

        async with AsyncSessionLocal() as session:
            network_repo = SqlAlchemyNetworkRepository(session)
            before = await network_repo.get_current_status(sample_edge_id)
            before_status = before.status if before else AccessibilityStatus.OPEN

        async with AsyncSessionLocal() as session:
            await refresh_edge_risks(session)

        async with AsyncSessionLocal() as session:
            network_repo = SqlAlchemyNetworkRepository(session)
            after = await network_repo.get_current_status(sample_edge_id)
            after_status = after.status if after else AccessibilityStatus.OPEN
            assert after_status == before_status
