"""
app/modules/reporting/domain/enums.py — Domain Enums for Field Reporting.
"""

from __future__ import annotations

from enum import Enum


class ReportType(str, Enum):
    """Specific field observation types in North-East mountain terrain."""
    LANDSLIDE = "LANDSLIDE"
    FLOODING = "FLOODING"
    ROAD_DAMAGE = "ROAD_DAMAGE"
    BRIDGE_COLLAPSE = "BRIDGE_COLLAPSE"
    TREE_FALL = "TREE_FALL"
    WEATHER_HAZARD = "WEATHER_HAZARD"
    SECURITY_INCIDENT = "SECURITY_INCIDENT"
    OBSTRUCTION = "OBSTRUCTION"
    OTHER = "OTHER"


class ReportSeverity(str, Enum):
    """Subjective severity observed by field reporter."""
    LOW = "LOW"
    MEDIUM = "MEDIUM"
    HIGH = "HIGH"
    CRITICAL = "CRITICAL"


class LaneStatus(str, Enum):
    """Observed lane availability on the affected road section."""
    BOTH_BLOCKED = "BOTH_BLOCKED"
    SINGLE_LANE_OPEN = "SINGLE_LANE_OPEN"
    SHOULDER_ONLY = "SHOULDER_ONLY"
    CLEAR = "CLEAR"


class PassableVehicleClass(str, Enum):
    """Vehicle classes the reporter observed getting through."""
    HEAVY_TRUCK = "HEAVY_TRUCK"
    LIGHT_4X4 = "LIGHT_4X4"
    EMERGENCY_ONLY = "EMERGENCY_ONLY"
    NONE = "NONE"


class ReviewState(str, Enum):
    """Field observation review workflow state."""
    SUBMITTED = "SUBMITTED"
    PROVISIONAL_CAUTION = "PROVISIONAL_CAUTION"
    UNDER_REVIEW = "UNDER_REVIEW"
    MORE_INFO_NEEDED = "MORE_INFO_NEEDED"
    VERIFIED = "VERIFIED"
    REJECTED = "REJECTED"


class ScanStatus(str, Enum):
    """Media object quarantine scanning lifecycle."""
    PENDING_SCAN = "PENDING_SCAN"
    CLEAN = "CLEAN"
    QUARANTINED = "QUARANTINED"
    REJECTED = "REJECTED"


class LocationProvider(str, Enum):
    """Sensor origin for location coordinates."""
    GPS_HARDWARE = "GPS_HARDWARE"
    NETWORK_COARSE = "NETWORK_COARSE"
    MANUAL_MAP_PICK = "MANUAL_MAP_PICK"


class RejectionReason(str, Enum):
    """Mandatory reason for report rejection."""
    DUPLICATE = "DUPLICATE"
    INACCURATE_LOCATION = "INACCURATE_LOCATION"
    SPAM_OR_INVALID = "SPAM_OR_INVALID"
    UNVERIFIABLE = "UNVERIFIABLE"
    RESOLVED_PRIOR_TO_REVIEW = "RESOLVED_PRIOR_TO_REVIEW"
    OTHER = "OTHER"
