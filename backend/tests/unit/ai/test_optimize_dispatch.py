"""
tests/unit/ai/test_optimize_dispatch.py — Unit Tests for OptimizeDispatchUseCase.
"""

from __future__ import annotations

import uuid
from unittest.mock import AsyncMock

import pytest

from app.modules.ai.application.optimize_dispatch import OptimizeDispatchUseCase
from app.modules.ai.application.ports import LogisticsDispatchSolverPort
from app.modules.ai.domain.entities import DispatchPlan, DispatchStop, DispatchVehicle
from app.modules.ai.domain.exceptions import InvalidFeatureVectorError


def make_stop() -> DispatchStop:
    return DispatchStop(stop_id=uuid.uuid4(), lon=91.75, lat=26.12, demand_kg=100.0)


def make_vehicle() -> DispatchVehicle:
    return DispatchVehicle(vehicle_id=uuid.uuid4(), capacity_kg=1000.0)


class TestOptimizeDispatchUseCase:
    async def test_delegates_to_solver(self) -> None:
        depot = make_stop()
        stop = make_stop()
        vehicle = make_vehicle()
        expected_plan = DispatchPlan(routes=[], unassigned_stop_ids=[])

        solver = AsyncMock(spec=LogisticsDispatchSolverPort)
        solver.solve.return_value = expected_plan

        use_case = OptimizeDispatchUseCase(solver)
        result = await use_case.execute(depot=depot, stops=[stop], vehicles=[vehicle])

        assert result is expected_plan
        solver.solve.assert_awaited_once_with(depot=depot, stops=[stop], vehicles=[vehicle])

    async def test_empty_stops_rejected(self) -> None:
        solver = AsyncMock(spec=LogisticsDispatchSolverPort)
        use_case = OptimizeDispatchUseCase(solver)

        with pytest.raises(InvalidFeatureVectorError):
            await use_case.execute(depot=make_stop(), stops=[], vehicles=[make_vehicle()])

        solver.solve.assert_not_awaited()

    async def test_empty_vehicles_rejected(self) -> None:
        solver = AsyncMock(spec=LogisticsDispatchSolverPort)
        use_case = OptimizeDispatchUseCase(solver)

        with pytest.raises(InvalidFeatureVectorError):
            await use_case.execute(depot=make_stop(), stops=[make_stop()], vehicles=[])

        solver.solve.assert_not_awaited()
