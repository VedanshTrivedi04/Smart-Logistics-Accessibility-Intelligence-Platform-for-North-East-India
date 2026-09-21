"""
tests/integration/impact/test_facility_isolation.py — Integration tests for facility reachability and isolation evaluation under road disruption.
"""

from __future__ import annotations

from datetime import datetime, timezone
import uuid

import pytest
from sqlalchemy import text

from app.core.db import AsyncSessionLocal
from app.modules.impact.application.evaluate_disruption_impact import EvaluateDisruptionImpactUseCase
from app.modules.impact.domain.enums import ImpactSeverity, ImpactType, ReachabilityState
from app.modules.impact.infrastructure.repository import SqlAlchemyImpactRepository


class TestFacilityIsolationEvaluation:
    async def test_facility_reachability_evaluated_on_edge_disruption(self) -> None:
        async with AsyncSessionLocal() as session:
            repo = SqlAlchemyImpactRepository(session)
            use_case = EvaluateDisruptionImpactUseCase(repo)

            # Find a facility and an edge nearby
            fac_res = await session.execute(text("SELECT id FROM facilities LIMIT 1"))
            fac_row = fac_res.first()
            if not fac_row:
                pytest.skip("No facilities in DB")

            edge_res = await session.execute(text("SELECT id FROM road_edges LIMIT 1"))
            edge_id = edge_res.scalar_one()

            event_id = uuid.uuid4()

            result = await use_case.execute(
                edge_id=edge_id,
                source_status_version=2,
                source_event_id=event_id,
                incident_id=uuid.uuid4(),
                impact_type=ImpactType.BLOCKED_ROUTE,
                severity=ImpactSeverity.CRITICAL,
                delay_estimated_seconds=3600,
            )

            assert "facilities_impacted" in result
            assert "trips_evaluated" in result

            # Verify facility impacts can be queried through the repository
            facility_impacts = result["facility_impacts"]
            if facility_impacts:
                f_impact = facility_impacts[0]
                queried = await repo.list_facility_impacts(f_impact.facility_id)
                assert len(queried) >= 1
                assert queried[0].reachability_state in (
                    ReachabilityState.RESTRICTED_REACHABLE,
                    ReachabilityState.NO_FEASIBLE_PATH,
                )
