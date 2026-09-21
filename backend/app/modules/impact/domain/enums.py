"""
app/modules/impact/domain/enums.py — Domain Enumerations for Disruption Impact Assessment.
"""

from __future__ import annotations

from enum import Enum


class ImpactType(str, Enum):
    BLOCKED_ROUTE = "BLOCKED_ROUTE"
    RESTRICTED_DELAY = "RESTRICTED_DELAY"
    BRIDGE_INCOMPATIBLE = "BRIDGE_INCOMPATIBLE"
    CURFEW_CONFLICT = "CURFEW_CONFLICT"


class ImpactSeverity(str, Enum):
    CRITICAL = "CRITICAL"
    HIGH = "HIGH"
    MODERATE = "MODERATE"
    LOW = "LOW"


class RecommendedAction(str, Enum):
    REROUTE_MANDATORY = "REROUTE_MANDATORY"
    REROUTE_ADVISORY = "REROUTE_ADVISORY"
    HOLD_AT_FACILITY = "HOLD_AT_FACILITY"
    PROCEED_WITH_CAUTION = "PROCEED_WITH_CAUTION"


class ReachabilityState(str, Enum):
    REACHABLE = "REACHABLE"
    RESTRICTED_REACHABLE = "RESTRICTED_REACHABLE"
    NO_FEASIBLE_PATH = "NO_FEASIBLE_PATH"
    INSUFFICIENT_DATA = "INSUFFICIENT_DATA"
