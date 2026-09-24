"""
app/modules/hazard/public.py — Explicit Public Contract for the Hazard Module.

Other modules must ONLY import from this file.
"""

from app.modules.hazard.application.ports import HazardRepositoryPort, WeatherProviderPort
from app.modules.hazard.domain.entities import RainfallObservation, RiskAssessment, RiskZone
from app.modules.hazard.domain.enums import RiskLevel, RiskZoneSource
from app.modules.hazard.domain.exceptions import HazardDomainError, RiskZoneNotFoundError
from app.modules.hazard.domain.risk_scoring import (
    compute_risk_score,
    derive_polygon_ring,
    score_to_level,
)

__all__ = [
    "RiskLevel",
    "RiskZoneSource",
    "RiskZone",
    "RainfallObservation",
    "RiskAssessment",
    "HazardDomainError",
    "RiskZoneNotFoundError",
    "compute_risk_score",
    "score_to_level",
    "derive_polygon_ring",
    "HazardRepositoryPort",
    "WeatherProviderPort",
]
