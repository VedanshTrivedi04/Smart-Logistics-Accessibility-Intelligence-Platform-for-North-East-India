"""
app/modules/routing/domain/enums.py — Domain Enumerations for Routing.
"""

from __future__ import annotations

from enum import Enum


class RouteResultStatus(str, Enum):
    FEASIBLE = "FEASIBLE"
    NO_FEASIBLE_PATH = "NO_FEASIBLE_PATH"
    INSUFFICIENT_DATA = "INSUFFICIENT_DATA"


class PolicyVersion(str, Enum):
    CONSERVATIVE_CRITICAL_V1 = "CONSERVATIVE_CRITICAL_V1"
    STANDARD_DISPATCH_V1 = "STANDARD_DISPATCH_V1"


class DispatchAction(str, Enum):
    ACCEPTED = "ACCEPTED"
    REJECTED = "REJECTED"
    DIVERTED = "DIVERTED"
