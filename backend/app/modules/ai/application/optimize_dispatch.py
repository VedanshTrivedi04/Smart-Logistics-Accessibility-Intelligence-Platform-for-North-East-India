"""
app/modules/ai/application/optimize_dispatch.py — Use case for CVRPTW-R dispatch optimization.
"""

from __future__ import annotations

from app.modules.ai.application.ports import LogisticsDispatchSolverPort
from app.modules.ai.domain.entities import DispatchPlan, DispatchStop, DispatchVehicle
from app.modules.ai.domain.exceptions import InvalidFeatureVectorError


class OptimizeDispatchUseCase:
    """
    Optimizes vehicle-to-delivery assignment and stop ordering. Takes
    pre-resolved DispatchStop/DispatchVehicle DTOs — resolving real
    DeliveryCommitment/Vehicle/Facility entities into these DTOs is the
    caller's (api/ layer's) responsibility, keeping this use case decoupled
    from the logistics/network modules' internals.
    """

    def __init__(self, solver: LogisticsDispatchSolverPort) -> None:
        self.solver = solver

    async def execute(
        self,
        depot: DispatchStop,
        stops: list[DispatchStop],
        vehicles: list[DispatchVehicle],
    ) -> DispatchPlan:
        if not stops:
            raise InvalidFeatureVectorError("stops must not be empty")
        if not vehicles:
            raise InvalidFeatureVectorError("vehicles must not be empty")

        return await self.solver.solve(depot=depot, stops=stops, vehicles=vehicles)
