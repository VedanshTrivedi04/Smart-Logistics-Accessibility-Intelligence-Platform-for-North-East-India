"""
tests/integration/routing/test_pgrouting_constraints.py — Integration tests for pgRouting Dijkstra and KSP pathfinding with domain constraints.
"""

from __future__ import annotations

from datetime import datetime, timezone
import uuid

import pytest
from sqlalchemy import text

from app.core.db import AsyncSessionLocal
from app.modules.routing.application.evaluate_route import EvaluateRouteUseCase
from app.modules.routing.domain.entities import VehicleConstraints
from app.modules.routing.domain.enums import PolicyVersion, RouteResultStatus
from app.modules.routing.infrastructure.repository import SqlAlchemyRoutingRepository


class TestPgRoutingExecution:
    async def test_standard_route_evaluation_between_nodes(self) -> None:
        async with AsyncSessionLocal() as session:
            repo = SqlAlchemyRoutingRepository(session)
            use_case = EvaluateRouteUseCase(repo)

            # Ensure all edges are temporarily OPEN for standard route & alternatives test
            await session.execute(text("UPDATE edge_status_current SET status = 'OPEN' WHERE status = 'BLOCKED'"))
            await session.commit()

            # Get node 1 and node 5 from the live road network
            res = await session.execute(
                text("SELECT id, node_index FROM road_nodes WHERE node_index IN (1, 5) ORDER BY node_index")
            )
            rows = res.fetchall()
            if len(rows) < 2:
                pytest.skip("Test network nodes 1 and 5 not found in DB")

            node_1_id, _ = rows[0]
            node_5_id, _ = rows[1]

            org_res = await session.execute(text("SELECT id FROM organizations LIMIT 1"))
            org_id = org_res.scalar_one()

            vc = VehicleConstraints(
                vehicle_id=None,
                max_weight_kg=15000.0,
                height_m=3.5,
                is_hazmat=False,
                cargo_priority="TIER_2_ESSENTIAL",
                departure_time=datetime(2026, 9, 21, 10, 0, tzinfo=timezone.utc),
            )

            plan = await use_case.execute(
                organization_id=org_id,
                vehicle_constraints=vc,
                origin_node_id=node_1_id,
                destination_node_id=node_5_id,
                policy_version=PolicyVersion.STANDARD_DISPATCH_V1,
            )

            assert plan.result_status == RouteResultStatus.FEASIBLE
            assert plan.total_distance_meters > 0
            assert plan.total_duration_seconds > 0
            assert len(plan.edges) >= 3
            assert plan.primary_geometry is not None
            assert len(plan.alternatives) >= 1

    async def test_blocked_edge_exclusion_and_detour(self) -> None:
        """When an edge on the primary corridor is BLOCKED, router detours around it."""
        async with AsyncSessionLocal() as session:
            repo = SqlAlchemyRoutingRepository(session)
            use_case = EvaluateRouteUseCase(repo)

            # Mark Edge 104 as BLOCKED
            await session.execute(
                text("UPDATE edge_status_current SET status = 'BLOCKED' WHERE edge_id IN (SELECT id FROM road_edges WHERE edge_index = 104)")
            )
            await session.commit()

            res = await session.execute(
                text("SELECT id, node_index FROM road_nodes WHERE node_index IN (1, 5) ORDER BY node_index")
            )
            rows = res.fetchall()
            if len(rows) < 2:
                pytest.skip("Test network nodes 1 and 5 not found in DB")

            node_1_id, _ = rows[0]
            node_5_id, _ = rows[1]
            org_id = (await session.execute(text("SELECT id FROM organizations LIMIT 1"))).scalar_one()

            vc = VehicleConstraints(
                vehicle_id=None,
                max_weight_kg=15000.0,
                height_m=3.5,
                is_hazmat=False,
                cargo_priority="TIER_2_ESSENTIAL",
                departure_time=datetime(2026, 9, 21, 10, 0, tzinfo=timezone.utc),
            )

            plan = await use_case.execute(
                organization_id=org_id,
                vehicle_constraints=vc,
                origin_node_id=node_1_id,
                destination_node_id=node_5_id,
                policy_version=PolicyVersion.CONSERVATIVE_CRITICAL_V1,
            )

            assert plan.result_status == RouteResultStatus.FEASIBLE
            assert any("ACCESSIBILITY_BLOCKED" in r for r in plan.excluded_edge_reasons.values())
            # None of the chosen edges should be edge 104
            edge_104_id = (await session.execute(text("SELECT id FROM road_edges WHERE edge_index = 104"))).scalar_one()
            assert all(e.edge_id != edge_104_id for e in plan.edges)

    async def test_heavy_vehicle_bridge_weight_exclusion(self) -> None:
        """Vehicle exceeding bridge capacity triggers edge exclusion or alternate routing."""
        async with AsyncSessionLocal() as session:
            repo = SqlAlchemyRoutingRepository(session)
            use_case = EvaluateRouteUseCase(repo)

            res = await session.execute(
                text("SELECT id, node_index FROM road_nodes WHERE node_index IN (1, 5) ORDER BY node_index")
            )
            rows = res.fetchall()
            if len(rows) < 2:
                pytest.skip("Test network nodes 1 and 5 not found in DB")

            node_1_id, _ = rows[0]
            node_5_id, _ = rows[1]
            org_id = (await session.execute(text("SELECT id FROM organizations LIMIT 1"))).scalar_one()

            # Massive weight: 99 tonnes (exceeds all normal NER bridge limits)
            vc_heavy = VehicleConstraints(
                vehicle_id=None,
                max_weight_kg=99000.0,
                height_m=4.5,
                is_hazmat=False,
                cargo_priority="TIER_1_CRITICAL",
                departure_time=datetime(2026, 9, 21, 10, 0, tzinfo=timezone.utc),
            )

            plan = await use_case.execute(
                organization_id=org_id,
                vehicle_constraints=vc_heavy,
                origin_node_id=node_1_id,
                destination_node_id=node_5_id,
                policy_version=PolicyVersion.CONSERVATIVE_CRITICAL_V1,
            )

            assert plan.result_status in (RouteResultStatus.FEASIBLE, RouteResultStatus.NO_FEASIBLE_PATH)
            if plan.result_status == RouteResultStatus.NO_FEASIBLE_PATH:
                assert plan.requires_human_review is True
