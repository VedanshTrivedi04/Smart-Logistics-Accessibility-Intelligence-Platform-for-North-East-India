"""
app/modules/ai/application/ports.py — Abstract Ports for AI/ML Inference Module.

Each port is implemented by a `infrastructure/` adapter. In Phase 0, the only
implementations are stub adapters returning fixed placeholder values — no model
artifacts exist yet. Application code (use cases) and api/ routers must depend
only on these interfaces, never on the concrete infrastructure classes directly
(the concrete class is selected once, at the api/ dependency-wiring boundary).
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from uuid import UUID

from app.modules.ai.domain.entities import (
    DispatchPlan,
    DispatchStop,
    DispatchVehicle,
    ETAEstimate,
    HazardVerification,
    LandslideEvent,
    RiskAssessment,
    TerrainFeatures,
    VoiceTranscript,
    WeatherFeatures,
)
from app.modules.ai.domain.enums import RiskHorizon


class RiskPredictorPort(ABC):
    """Abstract port for edge disruption-risk prediction (Module 2)."""

    @abstractmethod
    async def predict(
        self,
        edge_id: UUID,
        horizon: RiskHorizon,
        features: dict[str, float],
    ) -> RiskAssessment:
        """Predict P(blocked=1) for an edge within the given forecast horizon."""


class HazardVerifierPort(ABC):
    """Abstract port for field-report photo hazard verification (Module 1)."""

    @abstractmethod
    async def verify(self, image_bytes: bytes) -> HazardVerification:
        """Classify a submitted photo's hazard type, severity, and blockage status."""


class ETAPredictorPort(ABC):
    """
    Abstract port for terrain/weather-aware travel-time estimation (Module 3).

    Takes one pre-built feature vector per edge (see
    app.modules.ai.domain.feature_math.build_eta_feature_vector /
    ETA_FEATURE_COLUMNS) rather than raw edge_ids — the use case is
    responsible for resolving edge geometry + weather + vehicle attributes
    into these vectors via NetworkRepositoryPort/FeatureStoreRepositoryPort;
    this port stays a pure ML boundary with no knowledge of those modules.
    """

    @abstractmethod
    async def estimate(self, edge_features: list[dict[str, float]]) -> ETAEstimate:
        """Estimate total calibrated travel time with a confidence band across all edges."""


class FeatureStoreRepositoryPort(ABC):
    """Abstract port for the Phase 1 terrain/weather feature store and landslide catalog."""

    @abstractmethod
    async def save_terrain_features(self, features: list[TerrainFeatures]) -> None:
        """Upsert static topographical features for one or more edges."""

    @abstractmethod
    async def get_terrain_features(self, edge_id: UUID) -> TerrainFeatures | None:
        """Fetch the latest static topographical features for an edge."""

    @abstractmethod
    async def save_weather_features(self, features: list[WeatherFeatures]) -> None:
        """Append dynamic weather-feature observations for one or more edges."""

    @abstractmethod
    async def get_latest_weather_features(self, edge_id: UUID) -> WeatherFeatures | None:
        """Fetch the most recent weather-feature observation for an edge."""

    @abstractmethod
    async def save_landslide_events(self, events: list[LandslideEvent]) -> None:
        """Insert historical landslide/disruption events (training labels)."""


class LogisticsDispatchSolverPort(ABC):
    """Abstract port for the CVRPTW-R dispatch optimizer (Module 5)."""

    @abstractmethod
    async def solve(
        self,
        depot: DispatchStop,
        stops: list[DispatchStop],
        vehicles: list[DispatchVehicle],
    ) -> DispatchPlan:
        """Optimize vehicle-to-stop assignment/ordering, minimizing risk-weighted travel cost."""


class SpeechTranslationPort(ABC):
    """Abstract port for voice-note transcription + translation (Module 4)."""

    @abstractmethod
    async def transcribe_and_translate(
        self,
        audio_bytes: bytes,
        source_language: str,
        target_language: str = "en",
    ) -> VoiceTranscript:
        """Transcribe spoken audio and translate it into the target language."""
