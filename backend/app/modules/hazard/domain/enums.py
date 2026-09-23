"""
app/modules/hazard/domain/enums.py — Domain Enums for Landslide Risk & Rainfall Hazard Module.
"""

from __future__ import annotations

from enum import Enum


class RiskLevel(str, Enum):
    """Classification of landslide-risk severity for a risk zone at a point in time."""
    LOW = "LOW"
    MODERATE = "MODERATE"
    HIGH = "HIGH"
    SEVERE = "SEVERE"


class RiskZoneSource(str, Enum):
    """Provenance of how a risk zone was created."""
    TERRAIN_DERIVED = "TERRAIN_DERIVED"  # Auto-generated from steep road-network edges
    MANUAL = "MANUAL"  # Future-proofing: manually delineated by an authority (not yet used)
