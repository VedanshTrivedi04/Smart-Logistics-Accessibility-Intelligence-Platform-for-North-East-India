"""
app/modules/hazard/application/ports.py — Abstract Ports for Landslide Risk & Rainfall Hazard Module.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from uuid import UUID

from app.modules.hazard.domain.entities import RainfallObservation, RiskAssessment, RiskZone


class HazardRepositoryPort(ABC):
    """Abstract port for risk zone, rainfall observation & risk assessment persistence."""

    @abstractmethod
    async def get_bounded_risk_zones(
        self,
        min_lon: float,
        min_lat: float,
        max_lon: float,
        max_lat: float,
        limit: int = 500,
    ) -> list[RiskZone]:
        """Query risk zones within a geographic bounding box."""

    @abstractmethod
    async def save_risk_zones(self, zones: list[RiskZone]) -> None:
        """Persist newly derived risk zones."""

    @abstractmethod
    async def get_risk_zone_by_id(self, risk_zone_id: UUID) -> RiskZone | None:
        """Fetch a single risk zone by UUID."""

    @abstractmethod
    async def save_rainfall_observation(self, observation: RainfallObservation) -> None:
        """Persist a rainfall observation for a risk zone."""

    @abstractmethod
    async def save_risk_assessment(self, assessment: RiskAssessment) -> None:
        """Persist a computed risk assessment for a risk zone."""

    @abstractmethod
    async def get_latest_assessment(self, risk_zone_id: UUID) -> RiskAssessment | None:
        """Fetch the most recently computed risk assessment for a risk zone."""

    @abstractmethod
    async def get_latest_assessments_for_zones(
        self, zone_ids: list[UUID]
    ) -> dict[UUID, RiskAssessment]:
        """Fetch the most recent risk assessment for each of the given risk zones."""

    @abstractmethod
    async def has_any_risk_zones(self) -> bool:
        """Returns True if at least one risk zone has been persisted (idempotent seeding check)."""


class WeatherProviderPort(ABC):
    """Abstract port for a live rainfall data provider."""

    @abstractmethod
    async def get_rainfall(self, lat: float, lon: float) -> dict[str, float]:
        """
        Fetch trailing rainfall totals at a coordinate.

        Returns a dict with keys: "rainfall_mm_1h", "rainfall_mm_24h", "rainfall_mm_72h".
        Must never raise — implementations should degrade to zeros on failure.
        """
