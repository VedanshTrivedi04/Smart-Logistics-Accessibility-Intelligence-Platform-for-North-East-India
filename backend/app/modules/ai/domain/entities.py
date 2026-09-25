"""
app/modules/ai/domain/entities.py — Domain Entities and Value Objects for AI/ML Module.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from uuid import UUID

from app.modules.ai.domain.enums import HazardClass, ModelStatus, RiskHorizon, SusceptibilityZone


@dataclass(frozen=True)
class FeatureContribution:
    """Single SHAP-style feature contribution toward a risk prediction."""
    feature_name: str
    value: float
    shap_contribution: float


@dataclass(frozen=True)
class RiskAssessment:
    """Predicted probability that a road edge becomes blocked within a horizon."""
    edge_id: UUID
    horizon: RiskHorizon
    probability: float  # calibrated P(blocked=1)
    model_status: ModelStatus
    top_contributions: list[FeatureContribution] = field(default_factory=list)
    predicted_at: datetime | None = None
    # Uncalibrated model score, when `probability` was calibrated to an assumed prevalence.
    # Decision rules (e.g. risk_refresh_worker) use this so their thresholds do not depend
    # on the (unverifiable) prevalence assumption; None means `probability` is used as-is.
    raw_score: float | None = None

    def __post_init__(self) -> None:
        if not (0.0 <= self.probability <= 1.0):
            raise ValueError(f"probability must be in [0.0, 1.0], got {self.probability}")
        if self.raw_score is not None and not (0.0 <= self.raw_score <= 1.0):
            raise ValueError(f"raw_score must be in [0.0, 1.0], got {self.raw_score}")

    @property
    def decision_score(self) -> float:
        return self.probability if self.raw_score is None else self.raw_score


@dataclass(frozen=True)
class HazardVerification:
    """CV model's classification of a submitted field-report photo."""
    hazard_detected: bool
    hazard_class: HazardClass
    severity_score: float  # [0.0, 1.0]
    is_roadway_blocked: bool
    confidence: float  # [0.0, 1.0]
    model_status: ModelStatus
    # HazardClass values the model can actually recognise; empty = unknown. A model that cannot
    # recognise CLEAR_ROAD must not be read as asserting the road is clear when it finds nothing.
    detectable_classes: tuple[str, ...] = ()

    def __post_init__(self) -> None:
        if not (0.0 <= self.severity_score <= 1.0):
            raise ValueError(f"severity_score must be in [0.0, 1.0], got {self.severity_score}")
        if not (0.0 <= self.confidence <= 1.0):
            raise ValueError(f"confidence must be in [0.0, 1.0], got {self.confidence}")


@dataclass(frozen=True)
class TerrainFeatures:
    """Static topographical features for a road edge (Phase 1 feature store)."""
    edge_id: UUID
    elevation_min_m: float
    elevation_max_m: float
    elevation_mean_m: float
    slope_pct: float
    aspect_deg: float
    curvature_index: float
    susceptibility_zone: SusceptibilityZone
    distance_to_stream_m: float
    computed_at: datetime

    def __post_init__(self) -> None:
        if self.elevation_min_m > self.elevation_max_m:
            raise ValueError("elevation_min_m must be <= elevation_max_m")
        if not (0.0 <= self.aspect_deg < 360.0):
            raise ValueError(f"aspect_deg must be in [0.0, 360.0), got {self.aspect_deg}")
        if self.slope_pct < 0.0:
            raise ValueError(f"slope_pct must be >= 0.0, got {self.slope_pct}")
        if self.distance_to_stream_m < 0.0:
            raise ValueError(
                f"distance_to_stream_m must be >= 0.0, got {self.distance_to_stream_m}"
            )


@dataclass(frozen=True)
class WeatherFeatures:
    """Dynamic meteorological features for a road edge at a point in time."""
    edge_id: UUID
    observed_at: datetime
    rainfall_24h_mm: float
    rainfall_48h_mm: float
    rainfall_72h_mm: float
    ari_score: float
    forecast_rainfall_3h_mm: float
    forecast_rainfall_6h_mm: float
    forecast_rainfall_12h_mm: float
    soil_moisture_index: float

    def __post_init__(self) -> None:
        for field_name in (
            "rainfall_24h_mm",
            "rainfall_48h_mm",
            "rainfall_72h_mm",
            "forecast_rainfall_3h_mm",
            "forecast_rainfall_6h_mm",
            "forecast_rainfall_12h_mm",
        ):
            if getattr(self, field_name) < 0.0:
                raise ValueError(f"{field_name} must be >= 0.0")
        if not (0.0 <= self.soil_moisture_index <= 1.0):
            raise ValueError(
                f"soil_moisture_index must be in [0.0, 1.0], got {self.soil_moisture_index}"
            )


@dataclass(frozen=True)
class LandslideEvent:
    """Historical landslide/disruption event used as a supervised-learning label."""
    id: UUID
    edge_id: UUID | None  # None if not yet matched to a road edge
    longitude: float
    latitude: float
    occurred_at: datetime
    source: str  # e.g. "GSI_BHUSANKET", "SDMA"
    severity: str | None = None


@dataclass(frozen=True)
class ETAEstimate:
    """Terrain and weather adjusted travel-time estimate with a confidence band."""
    total_seconds: float
    lower_bound_seconds: float
    upper_bound_seconds: float
    model_status: ModelStatus

    def __post_init__(self) -> None:
        if self.total_seconds < 0.0:
            raise ValueError(f"total_seconds must be >= 0.0, got {self.total_seconds}")
        if self.lower_bound_seconds > self.upper_bound_seconds:
            raise ValueError("lower_bound_seconds must be <= upper_bound_seconds")


@dataclass(frozen=True)
class DispatchStop:
    """A single delivery/pickup point for the CVRPTW-R dispatch solver."""
    stop_id: UUID
    lon: float
    lat: float
    demand_kg: float = 0.0
    # Higher = more important to serve; used to weight the "drop" penalty so
    # TIER_1 critical supply is dropped only as an absolute last resort.
    priority_weight: int = 1
    # [0.0, 1.0] approximate disruption-risk multiplier applied to arcs
    # arriving at this stop (see aiml developer.md Module 5's w2 term).
    # Defaults to 0.0 (no penalty) until real per-edge risk resolution for
    # facility approach roads is wired in.
    risk_penalty: float = 0.0

    def __post_init__(self) -> None:
        if self.demand_kg < 0.0:
            raise ValueError(f"demand_kg must be >= 0.0, got {self.demand_kg}")
        if not (0.0 <= self.risk_penalty <= 1.0):
            raise ValueError(f"risk_penalty must be in [0.0, 1.0], got {self.risk_penalty}")


@dataclass(frozen=True)
class DispatchVehicle:
    """A vehicle available for dispatch optimization."""
    vehicle_id: UUID
    capacity_kg: float

    def __post_init__(self) -> None:
        if self.capacity_kg <= 0.0:
            raise ValueError(f"capacity_kg must be > 0.0, got {self.capacity_kg}")


@dataclass(frozen=True)
class DispatchRoute:
    """One vehicle's optimized, ordered stop sequence."""
    vehicle_id: UUID
    stop_ids: list[UUID]
    total_distance_meters: float
    total_duration_seconds: float


@dataclass(frozen=True)
class DispatchPlan:
    """Result of a dispatch optimization run."""
    routes: list[DispatchRoute]
    unassigned_stop_ids: list[UUID] = field(default_factory=list)


@dataclass(frozen=True)
class VoiceTranscript:
    """
    Result of transcribing + translating a field officer's spoken voice note
    (Module 4). `translated_text` is intended to populate an existing field
    report's free-text `description` via reporting's SubmitFieldReportUseCase
    — structured field extraction (hazard type, severity, location) is
    intentionally NOT attempted here: Bhashini's documented pipeline tasks
    are ASR/Translation/TTS, not NER, so those fields still come from the
    submitting officer's explicit selection, same as a typed report today.
    """
    source_language: str
    target_language: str
    transcribed_text: str
    translated_text: str
    model_status: ModelStatus


@dataclass(frozen=True)
class TextTranslation:
    """
    Machine translation of typed text (used where speech recognition is unavailable, e.g. Assamese,
    Manipuri, Bodo, Nepali - Bhashini offers translation but no ASR for them).
    """
    source_language: str
    target_language: str
    source_text: str
    translated_text: str
    model_status: ModelStatus
