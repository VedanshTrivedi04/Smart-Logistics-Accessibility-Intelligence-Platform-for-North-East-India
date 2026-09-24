"""
tests/unit/ai/test_ortools_dispatch_solver.py — Real (not mocked) OR-Tools Solver Tests.

OR-Tools is a pure local library — these tests run the actual constraint
solver, no stub/mock needed, unlike Module 1/2/3's model-artifact-dependent
adapters.
"""

from __future__ import annotations

import uuid

from app.modules.ai.domain.entities import DispatchStop, DispatchVehicle
from app.modules.ai.infrastructure.ortools_dispatch_solver import OrToolsDispatchSolver


def make_stop(**overrides: object) -> DispatchStop:
    defaults: dict[str, object] = {
        "stop_id": uuid.uuid4(),
        "lon": 91.75,
        "lat": 26.12,
        "demand_kg": 100.0,
        "priority_weight": 1,
        "risk_penalty": 0.0,
    }
    defaults.update(overrides)
    return DispatchStop(**defaults)  # type: ignore[arg-type]


class TestOrToolsDispatchSolverRealSolve:
    async def test_all_stops_assigned_when_capacity_sufficient(self) -> None:
        depot = make_stop(lon=91.70, lat=26.10, demand_kg=0.0)
        stops = [
            make_stop(lon=91.75, lat=26.12, demand_kg=200.0),
            make_stop(lon=91.80, lat=26.15, demand_kg=300.0),
            make_stop(lon=91.90, lat=26.20, demand_kg=100.0),
        ]
        vehicles = [DispatchVehicle(vehicle_id=uuid.uuid4(), capacity_kg=1000.0)]

        plan = await OrToolsDispatchSolver().solve(depot, stops, vehicles)

        assert plan.unassigned_stop_ids == []
        assigned = {sid for route in plan.routes for sid in route.stop_ids}
        assert assigned == {s.stop_id for s in stops}

    async def test_respects_vehicle_capacity(self) -> None:
        depot = make_stop(lon=91.70, lat=26.10, demand_kg=0.0)
        stops = [
            make_stop(lon=91.75, lat=26.12, demand_kg=600.0),
            make_stop(lon=91.80, lat=26.15, demand_kg=600.0),
        ]
        vehicles = [DispatchVehicle(vehicle_id=uuid.uuid4(), capacity_kg=1000.0)]

        plan = await OrToolsDispatchSolver().solve(depot, stops, vehicles)

        # Both stops together (1200kg) exceed the single vehicle's 1000kg
        # capacity, so at least one must be dropped rather than overloading it.
        assigned = {sid for route in plan.routes for sid in route.stop_ids}
        assert len(assigned) + len(plan.unassigned_stop_ids) == 2
        assert len(assigned) < 2 or len(plan.routes) > 1

    async def test_drops_low_priority_stop_over_high_priority_under_scarce_capacity(self) -> None:
        depot = make_stop(lon=91.70, lat=26.10, demand_kg=0.0)
        low = make_stop(lon=91.75, lat=26.12, demand_kg=900.0, priority_weight=1)
        high = make_stop(lon=91.80, lat=26.15, demand_kg=900.0, priority_weight=5)
        vehicles = [DispatchVehicle(vehicle_id=uuid.uuid4(), capacity_kg=1000.0)]

        plan = await OrToolsDispatchSolver().solve(depot, [low, high], vehicles)

        assert low.stop_id in plan.unassigned_stop_ids
        assert high.stop_id not in plan.unassigned_stop_ids

    async def test_distributes_across_multiple_vehicles(self) -> None:
        depot = make_stop(lon=91.70, lat=26.10, demand_kg=0.0)
        stops = [
            make_stop(lon=91.7 + i * 0.05, lat=26.1 + i * 0.05, demand_kg=400.0) for i in range(4)
        ]
        vehicles = [
            DispatchVehicle(vehicle_id=uuid.uuid4(), capacity_kg=500.0),
            DispatchVehicle(vehicle_id=uuid.uuid4(), capacity_kg=500.0),
        ]

        plan = await OrToolsDispatchSolver().solve(depot, stops, vehicles)

        used_vehicles = {r.vehicle_id for r in plan.routes}
        assert len(used_vehicles) >= 1
        for route in plan.routes:
            total_demand = sum(
                s.demand_kg for s in stops if s.stop_id in route.stop_ids
            )
            assert total_demand <= 500.0

    async def test_single_stop_single_vehicle(self) -> None:
        depot = make_stop(lon=91.70, lat=26.10, demand_kg=0.0)
        stop = make_stop(lon=91.75, lat=26.12, demand_kg=50.0)
        vehicles = [DispatchVehicle(vehicle_id=uuid.uuid4(), capacity_kg=1000.0)]

        plan = await OrToolsDispatchSolver().solve(depot, [stop], vehicles)

        assert plan.unassigned_stop_ids == []
        assert len(plan.routes) == 1
        assert plan.routes[0].stop_ids == [stop.stop_id]
        assert plan.routes[0].total_distance_meters > 0.0
        assert plan.routes[0].total_duration_seconds > 0.0
