"""
app/modules/ai/api/schemas.py — Pydantic Request/Response Schemas for AI/ML API.
"""

from __future__ import annotations

from uuid import UUID

from pydantic import BaseModel, Field

from app.modules.ai.domain.enums import HazardClass, ModelStatus, RiskHorizon


class PredictRiskRequest(BaseModel):
    edge_id: UUID
    horizon: RiskHorizon = RiskHorizon.H6
    # None (the default / omitted) means "fetch current terrain/weather
    # features from the feature store" — pass an explicit dict only for
    # what-if queries against arbitrary hypothetical feature values.
    features: dict[str, float] | None = None


class FeatureContributionResponse(BaseModel):
    feature_name: str
    value: float
    shap_contribution: float


class PredictRiskResponse(BaseModel):
    edge_id: UUID
    horizon: RiskHorizon
    probability: float
    model_status: ModelStatus
    top_contributions: list[FeatureContributionResponse]


class VerifyPhotoResponse(BaseModel):
    hazard_detected: bool
    hazard_class: HazardClass
    severity_score: float
    is_roadway_blocked: bool
    confidence: float
    model_status: ModelStatus


class AutoTriageReportRequest(BaseModel):
    report_id: UUID


class EstimateEtaRequest(BaseModel):
    edge_ids: list[UUID] = Field(min_length=1)
    vehicle_id: UUID | None = None
    max_weight_kg: float = Field(16000.0, gt=0.0)
    height_m: float = Field(3.5, gt=0.0)
    is_hazmat: bool = False
    cargo_priority: str = "TIER_2_ESSENTIAL"


class EstimateEtaResponse(BaseModel):
    total_seconds: float
    lower_bound_seconds: float
    upper_bound_seconds: float
    model_status: ModelStatus


class OptimizeDispatchRequest(BaseModel):
    depot_facility_id: UUID
    commitment_ids: list[UUID] = Field(min_length=1)
    vehicle_ids: list[UUID] = Field(min_length=1)


class DispatchRouteResponse(BaseModel):
    vehicle_id: UUID
    commitment_ids: list[UUID]
    total_distance_meters: float
    total_duration_seconds: float


class OptimizeDispatchResponse(BaseModel):
    routes: list[DispatchRouteResponse]
    unassigned_commitment_ids: list[UUID]


class TranscribeVoiceResponse(BaseModel):
    source_language: str
    target_language: str
    transcribed_text: str
    translated_text: str
    model_status: ModelStatus
