"""
app/modules/impact/application/ports.py — Repository and Service Ports for Impact Module.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from datetime import datetime
from typing import Any
from uuid import UUID

from app.modules.impact.domain.entities import CommitmentImpact, FacilityImpact, TripImpact


class ImpactRepositoryPort(ABC):
    """Port defining database operations for disruption impact assessments."""

    @abstractmethod
    async def get_active_trips_on_edge(self, edge_id: UUID) -> list[dict[str, Any]]:
        """
        Finds all active (DISPATCHED, IN_TRANSIT) trips whose route plan traverses the given edge.
        Returns trip metadata, route plan ID, route geometry, vehicle ID, and planned ETA.
        """
        ...

    @abstractmethod
    async def get_vehicle_position(self, vehicle_id: UUID) -> dict[str, Any] | None:
        """Returns the latest telemetry coordinate (lon, lat) and timestamp for a vehicle."""
        ...

    @abstractmethod
    async def calculate_relative_progress(
        self,
        route_geom_wkt: str,
        veh_lon: float,
        veh_lat: float,
        edge_id: UUID,
    ) -> dict[str, Any]:
        """
        Calculates relative progression using ST_LineLocatePoint.
        Returns:
            veh_progress: float (0.0 to 1.0)
            edge_progress: float (0.0 to 1.0)
            distance_meters: float (great circle distance from vehicle to edge)
            vehicle_is_ahead: bool (veh_progress >= edge_progress)
        """
        ...

    @abstractmethod
    async def get_trip_commitments(self, trip_id: UUID) -> list[dict[str, Any]]:
        """Retrieves delivery commitments associated with a trip."""
        ...

    @abstractmethod
    async def get_latest_trip_impact(self, trip_id: UUID, edge_id: UUID) -> TripImpact | None:
        """Retrieves the latest impact assessment for a trip on a specific edge."""
        ...

    @abstractmethod
    async def save_trip_impact(self, impact: TripImpact) -> None:
        """Persists or updates a TripImpact assessment record."""
        ...

    @abstractmethod
    async def save_commitment_impact(self, impact: CommitmentImpact) -> None:
        """Persists a CommitmentImpact assessment record."""
        ...

    @abstractmethod
    async def save_facility_impact(self, impact: FacilityImpact) -> None:
        """Persists a FacilityImpact record."""
        ...

    @abstractmethod
    async def list_trip_impacts(self, trip_id: UUID, active_only: bool = True) -> list[TripImpact]:
        """Lists impact assessments for a specific trip."""
        ...

    @abstractmethod
    async def list_facility_impacts(self, facility_id: UUID) -> list[FacilityImpact]:
        """Lists reachability impact assessments for a facility."""
        ...

    @abstractmethod
    async def evaluate_facility_reachability_impact(
        self,
        edge_id: UUID,
        status_version: int,
        incident_id: UUID | None,
    ) -> list[FacilityImpact]:
        """Evaluates facilities affected by the closure/disruption of the given edge."""
        ...
