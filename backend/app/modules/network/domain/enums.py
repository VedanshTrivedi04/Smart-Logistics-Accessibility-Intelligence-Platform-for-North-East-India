"""
app/modules/network/domain/enums.py — Domain Enums for GIS, Road Network & Spatial Intelligence.
"""

from __future__ import annotations

from enum import Enum


class AccessibilityStatus(str, Enum):
    """
    Separate status axis for physical/legal road traversability.
    Systemdesign.md lines 40-49:
    OPEN, RESTRICTED, BLOCKED, PROVISIONAL_CAUTION, UNKNOWN.
    """
    OPEN = "OPEN"
    RESTRICTED = "RESTRICTED"
    BLOCKED = "BLOCKED"
    PROVISIONAL_CAUTION = "PROVISIONAL_CAUTION"
    UNKNOWN = "UNKNOWN"


class RoadClass(str, Enum):
    """Classification of road segment in North-East India hierarchy."""
    NATIONAL_HIGHWAY = "NATIONAL_HIGHWAY"
    STATE_HIGHWAY = "STATE_HIGHWAY"
    MAJOR_DISTRICT_ROAD = "MAJOR_DISTRICT_ROAD"
    RURAL_ROAD_PMGSY = "RURAL_ROAD_PMGSY"
    URBAN_ROAD = "URBAN_ROAD"


class SurfaceType(str, Enum):
    """Pavement surface type influencing wet-weather friction and speed degradation."""
    PAVED_ASPHALT = "PAVED_ASPHALT"
    PAVED_CONCRETE = "PAVED_CONCRETE"
    UNPAVED_GRAVEL = "UNPAVED_GRAVEL"
    UNPAVED_EARTH = "UNPAVED_EARTH"
    BRIDGED = "BRIDGED"


class RestrictionKind(str, Enum):
    """Kinds of hard operational or physical constraints on road edges."""
    MAX_WEIGHT = "MAX_WEIGHT"
    MAX_HEIGHT = "MAX_HEIGHT"
    MAX_WIDTH = "MAX_WIDTH"
    MAX_AXLE_LOAD = "MAX_AXLE_LOAD"
    ONE_WAY = "ONE_WAY"
    NIGHT_CURFEW = "NIGHT_CURFEW"
    HAZARDOUS_CARGO_PROHIBITED = "HAZARDOUS_CARGO_PROHIBITED"
    SEASONAL_CLOSURE = "SEASONAL_CLOSURE"


class FacilityKind(str, Enum):
    """Enrolled critical facilities requiring lifeline reachability monitoring."""
    HOSPITAL = "HOSPITAL"
    OXYGEN_PLANT = "OXYGEN_PLANT"
    RELIEF_CAMP = "RELIEF_CAMP"
    LOGISTICS_HUB = "LOGISTICS_HUB"
    FUEL_DEPOT = "FUEL_DEPOT"
    WAREHOUSE = "WAREHOUSE"
    DISTRICT_HQ = "DISTRICT_HQ"


class ReachabilityStatus(str, Enum):
    """
    Reachability classification for enrolled facilities.
    Systemdesign.md line 126: Distinguish coverage gap from no path.
    """
    REACHABLE = "REACHABLE"
    RESTRICTED_REACHABLE = "RESTRICTED_REACHABLE"
    NO_FEASIBLE_PATH = "NO_FEASIBLE_PATH"
    INSUFFICIENT_DATA = "INSUFFICIENT_DATA"


class StatusFreshness(str, Enum):
    """Freshness classification of current edge status."""
    FRESH = "FRESH"
    STALE = "STALE"
    EXPIRED = "EXPIRED"


class SourceEventType(str, Enum):
    """Provenance origin of an edge status change."""
    FIELD_REPORT = "FIELD_REPORT"
    OFFICIAL_DECISION = "OFFICIAL_DECISION"
    WEATHER_HAZARD = "WEATHER_HAZARD"
    SYSTEM_EXPIRY = "SYSTEM_EXPIRY"


class StructuralCondition(str, Enum):
    """Structural condition rating of bridges and culverts."""
    GOOD = "GOOD"
    FAIR = "FAIR"
    CAUTION = "CAUTION"
    STRUCTURALLY_DEFICIENT = "STRUCTURALLY_DEFICIENT"
    CLOSED = "CLOSED"
    UNINSPECTED = "UNINSPECTED"
