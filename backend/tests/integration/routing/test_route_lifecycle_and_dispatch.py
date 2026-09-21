"""
tests/integration/routing/test_route_lifecycle_and_dispatch.py — Integration tests for route evaluation, immutable snapshots, and human dispatch decisions (ADR-07).
"""

from __future__ import annotations

from datetime import datetime, timezone
import uuid

import pytest
from sqlalchemy import text

from app.core.db import AsyncSessionLocal
from app.modules.routing.application.evaluate_route import EvaluateRouteUseCase
from app.modules.routing.application.record_dispatch_decision import RecordDispatchDecisionUseCase
from app.modules.routing.domain.entities import VehicleConstraints
from app.modules.routing.domain.enums import DispatchAction, PolicyVersion
from app.modules.routing.domain.exceptions import StaleRouteError
from app.modules.routing.infrastructure.repository import SqlAlchemyRoutingRepository


class TestRouteLifecycleAndDispatch:
    async def test_route_evaluation_persists_immutable_snapshot(self) -> None:
        async with AsyncSessionLocal() as session:
            repo = SqlAlchemyRoutingRepository(session)
            use_case = EvaluateRouteUseCase(repo)

            res = await session.execute(
                text("SELECT id, node_index FROM road_nodes WHERE node_index IN (1, 3) ORDER BY node_index")
            )
            rows = res.fetchall()
            if len(rows) < 2:
                pytest.skip("Test network nodes 1 and 3 not found in DB")

            node_1_id, _ = rows[0]
            node_3_id, _ = rows[1]
            org_id = (await session.execute(text("SELECT id FROM organizations LIMIT 1"))).scalar_one()

            vc = VehicleConstraints(
                vehicle_id=None,
                max_weight_kg=12000.0,
                height_m=3.2,
                is_hazmat=False,
                cargo_priority="TIER_3_STANDARD",
                departure_time=datetime.now(timezone.utc),
            )

            plan = await use_case.execute(
                organization_id=org_id,
                vehicle_constraints=vc,
                origin_node_id=node_1_id,
                destination_node_id=node_3_id,
                policy_version=PolicyVersion.STANDARD_DISPATCH_V1,
            )

            # Verify persisted in database
            persisted_plan = await repo.get_route_plan_by_id(plan.id)
            assert persisted_plan is not None
            assert persisted_plan.id == plan.id
            assert persisted_plan.total_distance_meters == plan.total_distance_meters
            assert len(persisted_plan.edges) == len(plan.edges)

    async def test_dispatch_decision_success_and_trip_update(self) -> None:
        async with AsyncSessionLocal() as session:
            repo = SqlAlchemyRoutingRepository(session)
            eval_use_case = EvaluateRouteUseCase(repo)
            dispatch_use_case = RecordDispatchDecisionUseCase(repo)

            # Fetch active user, org, and trip
            user_id = (await session.execute(text("SELECT id FROM users LIMIT 1"))).scalar_one()
            org_id = (await session.execute(text("SELECT id FROM organizations LIMIT 1"))).scalar_one()
            trip_res = await session.execute(text("SELECT id FROM trips LIMIT 1"))
            trip_row = trip_res.first()
            if not trip_row:
                pytest.skip("No trip found in DB")
            trip_id = trip_row[0]
            await session.execute(text("UPDATE trips SET status = 'PLANNED' WHERE id = :trip_id"), {"trip_id": trip_id})
            await session.commit()

            nodes = (await session.execute(
                text("SELECT id FROM road_nodes WHERE node_index IN (1, 2) ORDER BY node_index")
            )).fetchall()
            if len(nodes) < 2:
                pytest.skip("Nodes 1 and 2 not found")

            vc = VehicleConstraints(
                vehicle_id=None,
                max_weight_kg=10000.0,
                height_m=3.0,
                is_hazmat=False,
                cargo_priority="TIER_2_ESSENTIAL",
                departure_time=datetime.now(timezone.utc),
            )

            plan = await eval_use_case.execute(
                organization_id=org_id,
                vehicle_constraints=vc,
                trip_id=trip_id,
                origin_node_id=nodes[0][0],
                destination_node_id=nodes[1][0],
            )

            # Record human dispatch approval
            decision = await dispatch_use_case.execute(
                trip_id=trip_id,
                route_plan_id=plan.id,
                actor_id=user_id,
                action=DispatchAction.ACCEPTED,
                reason="Dispatch approved by Logistics Manager under favorable morning weather",
                selected_alternative_rank=0,
            )

            assert decision.action == DispatchAction.ACCEPTED
            assert decision.route_plan_id == plan.id

            # Verify trip updated with route snapshot
            updated_trip = (await session.execute(
                text("SELECT current_route_snapshot_id, status FROM trips WHERE id = :trip_id"),
                {"trip_id": trip_id},
            )).mappings().first()
            assert updated_trip["current_route_snapshot_id"] == plan.id
            assert updated_trip["status"] == "DISPATCHED"

    async def test_stale_route_plan_rejected_when_status_version_changes(self) -> None:
        """ADR-07 & Directive #2: Any mutation in road status increments status_version and invalidates prior route evaluations."""
        async with AsyncSessionLocal() as session:
            repo = SqlAlchemyRoutingRepository(session)
            eval_use_case = EvaluateRouteUseCase(repo)
            dispatch_use_case = RecordDispatchDecisionUseCase(repo)

            user_id = (await session.execute(text("SELECT id FROM users LIMIT 1"))).scalar_one()
            org_id = (await session.execute(text("SELECT id FROM organizations LIMIT 1"))).scalar_one()
            trip_id = (await session.execute(text("SELECT id FROM trips LIMIT 1"))).scalar_one()
            nodes = (await session.execute(
                text("SELECT id FROM road_nodes WHERE node_index IN (1, 2) ORDER BY node_index")
            )).fetchall()

            vc = VehicleConstraints(
                vehicle_id=None,
                max_weight_kg=10000.0,
                height_m=3.0,
                is_hazmat=False,
                cargo_priority="TIER_2_ESSENTIAL",
                departure_time=datetime.now(timezone.utc),
            )

            # 1. Evaluate route at current status_version
            plan = await eval_use_case.execute(
                organization_id=org_id,
                vehicle_constraints=vc,
                trip_id=trip_id,
                origin_node_id=nodes[0][0],
                destination_node_id=nodes[1][0],
            )

            # 2. Simulate road disruption updating the network status_version
            await session.execute(text("UPDATE network_versions SET status_version = status_version + 1"))
            await session.commit()

            # 3. Attempt human dispatch on the now-stale route plan
            with pytest.raises(StaleRouteError) as exc_info:
                await dispatch_use_case.execute(
                    trip_id=trip_id,
                    route_plan_id=plan.id,
                    actor_id=user_id,
                    action=DispatchAction.ACCEPTED,
                    reason="Attempting dispatch with stale snapshot",
                )

            assert "status changed since evaluation" in str(exc_info.value).lower()
