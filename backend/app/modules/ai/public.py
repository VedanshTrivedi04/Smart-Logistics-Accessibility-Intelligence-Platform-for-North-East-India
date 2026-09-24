"""
app/modules/ai/public.py — Explicit Public Contract for the AI/ML Inference Module.

Other modules must ONLY import from this file, never reach into ai/domain,
ai/application, or ai/infrastructure directly.
"""

from app.modules.ai.application.estimate_eta import EstimateETAUseCase
from app.modules.ai.application.optimize_dispatch import OptimizeDispatchUseCase
from app.modules.ai.application.ports import (
    ETAPredictorPort,
    FeatureStoreRepositoryPort,
    HazardVerifierPort,
    LogisticsDispatchSolverPort,
    RiskPredictorPort,
    SpeechTranslationPort,
)
from app.modules.ai.application.predict_edge_risk import PredictEdgeRiskUseCase
from app.modules.ai.application.transcribe_voice_report import TranscribeVoiceReportUseCase
from app.modules.ai.application.verify_hazard_photo import VerifyHazardPhotoUseCase
from app.modules.ai.domain.entities import (
    DispatchPlan,
    DispatchRoute,
    DispatchStop,
    DispatchVehicle,
    ETAEstimate,
    FeatureContribution,
    HazardVerification,
    LandslideEvent,
    RiskAssessment,
    TerrainFeatures,
    VoiceTranscript,
    WeatherFeatures,
)
from app.modules.ai.domain.enums import (
    HazardClass,
    ModelStatus,
    RiskHorizon,
    SusceptibilityZone,
)
from app.modules.ai.domain.exceptions import (
    AiDomainError,
    InvalidFeatureVectorError,
    ModelNotLoadedError,
)

__all__ = [
    "AiDomainError",
    "DispatchPlan",
    "DispatchRoute",
    "DispatchStop",
    "DispatchVehicle",
    "ETAEstimate",
    "ETAPredictorPort",
    "EstimateETAUseCase",
    "FeatureContribution",
    "FeatureStoreRepositoryPort",
    "HazardClass",
    "HazardVerification",
    "HazardVerifierPort",
    "InvalidFeatureVectorError",
    "LandslideEvent",
    "LogisticsDispatchSolverPort",
    "ModelNotLoadedError",
    "ModelStatus",
    "OptimizeDispatchUseCase",
    "PredictEdgeRiskUseCase",
    "RiskAssessment",
    "RiskHorizon",
    "RiskPredictorPort",
    "SpeechTranslationPort",
    "SusceptibilityZone",
    "TerrainFeatures",
    "TranscribeVoiceReportUseCase",
    "VerifyHazardPhotoUseCase",
    "VoiceTranscript",
    "WeatherFeatures",
]
