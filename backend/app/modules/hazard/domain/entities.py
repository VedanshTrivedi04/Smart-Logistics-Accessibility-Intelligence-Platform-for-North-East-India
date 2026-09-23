"""
app/modules/hazard/domain/entities.py — Domain Entities for Landslide Risk & Rainfall Hazard Module.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from typing import Any
from uuid import UUID

from app.modules.hazard.domain.enums import RiskLevel, RiskZoneSource


@dataclass(frozen=True)
class RiskZone:
    """A terrain-derived (or manually delineated) landslide-susceptible area around a road segment."""
    id: UUID
    name: str
    jurisdiction_id: UUID | None
    source: RiskZoneSource
    base_susceptibility: float  # 0.0-1.0, derived from terrain gradient at creation time
    centroid_lon: float
    centroid_lat: float
    polygon_coordinates: list[tuple[float, float]]  # Closed ring buffered around the steep segment
    related_edge_id: UUID | None
    created_at: datetime


@dataclass(frozen=True)
class RainfallObservation:
    """A single rainfall reading fetched for a risk zone's centroid at a point in time."""
    id: UUID
    risk_zone_id: UUID
    rainfall_mm_1h: float
    rainfall_mm_24h: float
    rainfall_mm_72h: float
    observed_at: datetime
    source: str  # e.g. "open-meteo"


@dataclass(frozen=True)
class RiskAssessment:
    """A computed landslide-risk assessment combining terrain susceptibility and live rainfall."""
    id: UUID
    risk_zone_id: UUID
    risk_level: RiskLevel
    risk_score: float  # 0.0-1.0
    rainfall_mm_24h: float
    rainfall_mm_72h: float
    computed_at: datetime
    contributing_factors: dict[str, Any] = field(default_factory=dict)
