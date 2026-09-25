"""
app/modules/ai/api/schemas.py — Pydantic Request/Response Schemas for AI/ML API.
"""

from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field

from app.modules.ai.domain.enums import HazardClass, ModelStatus, RiskHorizon
from app.modules.reporting.public import ReportSeverity, ReportType


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
    detectable_classes: list[str] = Field(
        default_factory=list,
        description="Hazard classes this model can recognise (empty = unknown). 'No hazard found' "
        "only means 'road clear' when CLEAR_ROAD is listed.",
    )


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
    training_data: str | None = Field(
        None, description="Provenance of the ETA training data (e.g. SYNTHETIC_NE_CALIBRATED)"
    )


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


class TranslateTextRequest(BaseModel):
    text: str = Field(min_length=1, max_length=2000)
    source_language: str = Field(min_length=2, max_length=8)
    target_language: str = Field("en", min_length=2, max_length=8)


class TranslateTextResponse(BaseModel):
    source_language: str
    target_language: str
    source_text: str
    translated_text: str
    model_status: ModelStatus


class TextReportRequest(BaseModel):
    """Typed-text report for languages Bhashini can translate but not transcribe."""

    text: str = Field(min_length=3, max_length=1500)
    source_language: str = Field(min_length=2, max_length=8)
    latitude: float
    longitude: float
    accuracy_m: float = Field(gt=0)
    report_type: ReportType | None = Field(None, description="Auto-suggested when omitted")
    severity: ReportSeverity | None = Field(None, description="Never inferred; defaults to MEDIUM")
    observed_at: datetime | None = None
    client_operation_id: str | None = Field(None, max_length=128)


class VoiceReportInferredFields(BaseModel):
    report_type: bool = Field(description="True when report_type was suggested from the transcript")
    severity: bool = Field(description="True when severity was not given and defaulted")


class VoiceReportResponse(BaseModel):
    report_id: UUID
    review_state: str
    report_type: str
    severity: str
    description: str
    candidate_edge_id: UUID | None
    source_language: str
    transcribed_text: str | None
    translated_text: str | None
    inferred_fields: VoiceReportInferredFields
    replayed: bool = False
