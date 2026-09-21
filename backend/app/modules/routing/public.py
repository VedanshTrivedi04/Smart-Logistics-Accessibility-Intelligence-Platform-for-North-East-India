"""
app/modules/routing/public.py — Explicit Public Contract for the Routing Module.
"""

from app.modules.routing.application.evaluate_route import EvaluateRouteUseCase
from app.modules.routing.application.ports import RoutingRepositoryPort
from app.modules.routing.application.record_dispatch_decision import RecordDispatchDecisionUseCase
from app.modules.routing.domain.entities import (
    AlternativeRoute,
    DispatchDecision,
    RouteEdge,
    RoutePlan,
    VehicleConstraints,
)
from app.modules.routing.domain.enums import (
    DispatchAction,
    PolicyVersion,
    RouteResultStatus,
)
from app.modules.routing.domain.exceptions import (
    CoordinateOutOfBoundsError,
    NoFeasiblePathError,
    NodeNotFoundError,
    RoutePlanNotFoundError,
    StaleRouteError,
)

__all__ = [
    "RouteResultStatus",
    "PolicyVersion",
    "DispatchAction",
    "VehicleConstraints",
    "RouteEdge",
    "AlternativeRoute",
    "RoutePlan",
    "DispatchDecision",
    "RoutingRepositoryPort",
    "EvaluateRouteUseCase",
    "RecordDispatchDecisionUseCase",
    "NoFeasiblePathError",
    "StaleRouteError",
    "NodeNotFoundError",
    "RoutePlanNotFoundError",
    "CoordinateOutOfBoundsError",
]
