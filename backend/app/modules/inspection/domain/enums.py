"""
app/modules/inspection/domain/enums.py — Domain Enums for Inspection Module.
"""

from __future__ import annotations

from enum import Enum


class InspectionStatus(str, Enum):
    """Lifecycle state of an infrastructure inspection task."""
    ASSIGNED = "ASSIGNED"
    IN_PROGRESS = "IN_PROGRESS"
    COMPLETED = "COMPLETED"
    REINSPECTION_REQUIRED = "REINSPECTION_REQUIRED"
    CANCELLED = "CANCELLED"


class InspectionPriority(str, Enum):
    """Urgency level for dispatching an on-site engineer/inspector."""
    CRITICAL = "CRITICAL"
    HIGH = "HIGH"
    MEDIUM = "MEDIUM"
    LOW = "LOW"


class EvidenceKind(str, Enum):
    """Categorized evidence types required for technical verification."""
    WIDE_ANGLE = "WIDE_ANGLE"             # Overview of corridor and hazard context
    CLOSE_UP = "CLOSE_UP"                 # High-resolution focus on damage detail
    DAMAGE_SCALE = "DAMAGE_SCALE"         # Object/measurement rod proving scale
    GPS_SURVEY = "GPS_SURVEY"             # Georeferenced landmark / milestone confirmation
    PASSABILITY_PROOF = "PASSABILITY_PROOF" # Clearance width / vehicle traversability
    ENGINEERING_SKETCH = "ENGINEERING_SKETCH" # Field cross-section or schematic diagram


class DamageType(str, Enum):
    """Specific technical failure classification."""
    LANDSLIDE = "LANDSLIDE"
    FLOODING = "FLOODING"
    BRIDGE_SCOUR = "BRIDGE_SCOUR"
    CULVERT_COLLAPSE = "CULVERT_COLLAPSE"
    ROAD_EROSION = "ROAD_EROSION"
    PAVEMENT_CRACKING = "PAVEMENT_CRACKING"
    FALLEN_DEBRIS = "FALLEN_DEBRIS"
    OTHER = "OTHER"


class PassabilityStatus(str, Enum):
    """Authoritative physical traversability of the affected highway asset."""
    IMPASSABLE = "IMPASSABLE"
    EMERGENCY_ONLY = "EMERGENCY_ONLY"
    SINGLE_LANE_LIGHT = "SINGLE_LANE_LIGHT"
    ALL_VEHICLES = "ALL_VEHICLES"


class StructuralStability(str, Enum):
    """Engineering assessment of ground or structural stability."""
    STABLE = "STABLE"
    MONITORING_REQUIRED = "MONITORING_REQUIRED"
    IMMINENT_FAILURE = "IMMINENT_FAILURE"
    CRITICAL_FAILURE = "CRITICAL_FAILURE"
