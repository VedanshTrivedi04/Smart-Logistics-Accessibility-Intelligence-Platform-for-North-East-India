"""
app/modules/impact/public.py — Public boundary interface for the Disruption Impact module.
"""

from __future__ import annotations

from app.modules.impact.api.router import router
from app.modules.impact.application.evaluate_disruption_impact import EvaluateDisruptionImpactUseCase
from app.modules.impact.application.ports import ImpactRepositoryPort
from app.modules.impact.domain.entities import CommitmentImpact, FacilityImpact, TripImpact
from app.modules.impact.domain.enums import (
    ImpactSeverity,
    ImpactType,
    ReachabilityState,
    RecommendedAction,
)
from app.modules.impact.domain.exceptions import ImpactEvaluationError, TripImpactNotFoundError
from app.modules.impact.infrastructure.repository import SqlAlchemyImpactRepository

__all__ = [
    "CommitmentImpact",
    "EvaluateDisruptionImpactUseCase",
    "FacilityImpact",
    "ImpactEvaluationError",
    "ImpactRepositoryPort",
    "ImpactSeverity",
    "ImpactType",
    "ReachabilityState",
    "RecommendedAction",
    "SqlAlchemyImpactRepository",
    "TripImpact",
    "TripImpactNotFoundError",
    "router",
]
