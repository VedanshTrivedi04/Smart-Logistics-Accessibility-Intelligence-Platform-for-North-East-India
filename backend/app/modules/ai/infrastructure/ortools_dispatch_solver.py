"""
app/modules/ai/infrastructure/ortools_dispatch_solver.py — Dispatch solver adapter (Module 5).

Implements a Capacitated Vehicle Routing Problem with a risk-weighted arc cost
and priority-weighted drop penalties (CVRPTW-R per aiml developer.md §2
Module 5), using Google OR-Tools' constraint-programming routing solver.

Distances are computed as great-circle (haversine) straight lines between
stop coordinates, not real pgRouting network distances — a documented
simplification (see dispatch_math.py) since real network distances require a
live database. Time windows are not yet enforced (the "TW" in CVRPTW-R) —
only capacity + risk-weighted cost + priority-weighted drop penalties are
implemented in this first pass; adding real arrival-time windows is a
natural follow-up once real per-edge travel times (Module 3) feed into the
same distance matrix this solver already builds.

No stub/fallback here (unlike the other three infra adapters): OR-Tools is a
pure local library with no external model artifact or API key dependency, so
there's nothing to "fall back" from — if `ortools` isn't installed, this
raises ImportError immediately and clearly, which is the correct failure
mode for a missing hard dependency.
"""

from __future__ import annotations

import asyncio
from uuid import UUID

# Imported eagerly at module level (main-thread import time) rather than
# lazily inside _solve_sync: OR-Tools' native pywrapcp extension can crash
# with a Windows access violation if its *first* import happens off the main
# thread (e.g. inside the asyncio.to_thread() worker this solver otherwise
# runs on) — reproduced concretely while adding this module's tests. Unlike
# the other three infra adapters, there's no "missing artifact" story to
# lazily guard against here anyway: ortools is a hard, always-installed
# dependency, so eager import is also the more honest failure mode (an
# ImportError at app startup, not a confusing crash mid-request).
from ortools.constraint_solver import pywrapcp, routing_enums_pb2

from app.modules.ai.application.ports import LogisticsDispatchSolverPort
from app.modules.ai.domain.dispatch_math import (
    apply_risk_penalty,
    build_haversine_distance_matrix,
    estimate_duration_seconds,
)
from app.modules.ai.domain.entities import (
    DispatchPlan,
    DispatchRoute,
    DispatchStop,
    DispatchVehicle,
)

# How strongly disruption risk inflates an arc's cost relative to raw distance.
RISK_PENALTY_WEIGHT = 1.0

# Search time budget per solve() call.
SEARCH_TIME_LIMIT_SECONDS = 5

# Base drop penalty multiplier per unit of priority_weight — must exceed any
# plausible route distance so the solver only drops a stop as a last resort,
# scaled by how critical the commitment is (aiml developer.md's w3 term).
DROP_PENALTY_PER_PRIORITY_UNIT = 1_000_000


class OrToolsDispatchSolver(LogisticsDispatchSolverPort):
    """Real adapter for LogisticsDispatchSolverPort, backed by Google OR-Tools."""

    async def solve(
        self,
        depot: DispatchStop,
        stops: list[DispatchStop],
        vehicles: list[DispatchVehicle],
    ) -> DispatchPlan:
        return await asyncio.to_thread(self._solve_sync, depot, stops, vehicles)

    def _solve_sync(
        self,
        depot: DispatchStop,
        stops: list[DispatchStop],
        vehicles: list[DispatchVehicle],
    ) -> DispatchPlan:
        all_stops = [depot, *stops]
        points = [(s.lon, s.lat) for s in all_stops]
        distance_matrix = build_haversine_distance_matrix(points)
        risk_penalties = [s.risk_penalty for s in all_stops]
        cost_matrix = apply_risk_penalty(distance_matrix, risk_penalties, RISK_PENALTY_WEIGHT)

        manager = pywrapcp.RoutingIndexManager(len(all_stops), len(vehicles), 0)
        routing = pywrapcp.RoutingModel(manager)

        def cost_callback(from_index: int, to_index: int) -> int:
            from_node = manager.IndexToNode(from_index)
            to_node = manager.IndexToNode(to_index)
            return int(cost_matrix[from_node][to_node])

        transit_callback_index = routing.RegisterTransitCallback(cost_callback)
        routing.SetArcCostEvaluatorOfAllVehicles(transit_callback_index)

        demands = [0] + [int(s.demand_kg) for s in stops]

        def demand_callback(from_index: int) -> int:
            return int(demands[manager.IndexToNode(from_index)])

        demand_callback_index = routing.RegisterUnaryTransitCallback(demand_callback)
        routing.AddDimensionWithVehicleCapacity(
            demand_callback_index,
            0,
            [int(v.capacity_kg) for v in vehicles],
            True,
            "Capacity",
        )

        for i, stop in enumerate(stops, start=1):
            node_index = manager.NodeToIndex(i)
            drop_penalty = DROP_PENALTY_PER_PRIORITY_UNIT * max(1, stop.priority_weight)
            routing.AddDisjunction([node_index], drop_penalty)

        search_parameters = pywrapcp.DefaultRoutingSearchParameters()
        search_parameters.first_solution_strategy = (
            routing_enums_pb2.FirstSolutionStrategy.PATH_CHEAPEST_ARC
        )
        search_parameters.time_limit.FromSeconds(SEARCH_TIME_LIMIT_SECONDS)

        solution = routing.SolveWithParameters(search_parameters)
        if solution is None:
            return DispatchPlan(routes=[], unassigned_stop_ids=[s.stop_id for s in stops])

        return self._extract_plan(manager, routing, solution, all_stops, vehicles, distance_matrix)

    def _extract_plan(
        self,
        manager: object,
        routing: object,
        solution: object,
        all_stops: list[DispatchStop],
        vehicles: list[DispatchVehicle],
        distance_matrix: list[list[float]],
    ) -> DispatchPlan:
        routes: list[DispatchRoute] = []
        assigned_node_indices: set[int] = set()

        for vehicle_idx in range(len(vehicles)):
            index = routing.Start(vehicle_idx)  # type: ignore[attr-defined]
            stop_ids: list[UUID] = []
            route_distance = 0.0

            while not routing.IsEnd(index):  # type: ignore[attr-defined]
                node = manager.IndexToNode(index)  # type: ignore[attr-defined]
                if node != 0:
                    stop_ids.append(all_stops[node].stop_id)
                    assigned_node_indices.add(node)
                next_index = solution.Value(routing.NextVar(index))  # type: ignore[attr-defined]
                next_node = manager.IndexToNode(next_index)  # type: ignore[attr-defined]
                route_distance += distance_matrix[node][next_node]
                index = next_index

            if stop_ids:
                routes.append(
                    DispatchRoute(
                        vehicle_id=vehicles[vehicle_idx].vehicle_id,
                        stop_ids=stop_ids,
                        total_distance_meters=route_distance,
                        total_duration_seconds=estimate_duration_seconds(route_distance),
                    )
                )

        unassigned_stop_ids = [
            stop.stop_id
            for i, stop in enumerate(all_stops[1:], start=1)
            if i not in assigned_node_indices
        ]

        return DispatchPlan(routes=routes, unassigned_stop_ids=unassigned_stop_ids)
