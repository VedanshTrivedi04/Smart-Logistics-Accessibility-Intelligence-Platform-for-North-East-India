"""
app/modules/routing/domain/exceptions.py — Domain Exceptions for Routing.
"""

from __future__ import annotations

from app.core.exceptions import (
    ConflictError,
    NotFoundError,
    UnprocessableError,
)


class NoFeasiblePathError(UnprocessableError):
    code = "NO_FEASIBLE_PATH"

    def __init__(self, message: str = "No feasible path exists satisfying all constraints"):
        super().__init__(message=message, code=self.code)


class StaleRouteError(ConflictError):
    code = "STALE_ROUTE_PLAN"

    def __init__(self, message: str = "Road network status or route plan has expired or changed"):
        super().__init__(message=message, code=self.code)


class NodeNotFoundError(NotFoundError):
    code = "ROUTING_NODE_NOT_FOUND"

    def __init__(self, message: str = "Routing node not found"):
        super().__init__(message=message, code=self.code)


class RoutePlanNotFoundError(NotFoundError):
    code = "ROUTE_PLAN_NOT_FOUND"

    def __init__(self, message: str = "Route plan not found"):
        super().__init__(message=message, code=self.code)


class CoordinateOutOfBoundsError(UnprocessableError):
    code = "COORDINATE_OUT_OF_NETWORK_BOUNDS"

    def __init__(self, message: str = "Coordinate exceeds maximum distance to nearest road network node"):
        super().__init__(message=message, code=self.code)
