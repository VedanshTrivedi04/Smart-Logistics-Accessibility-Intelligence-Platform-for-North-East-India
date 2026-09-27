"""
app/modules/logistics/application/ports.py — Application repository ports for Logistics.
"""

from __future__ import annotations

from typing import Protocol
from uuid import UUID

from app.modules.logistics.domain.entities import (
    DeliveryCommitment,
    Driver,
    Trip,
    Vehicle,
)
from app.modules.logistics.domain.enums import DeliveryStatus, TripStatus


class LogisticsRepositoryPort(Protocol):
    """Abstract port for Logistics data operations."""

    async def get_vehicle_by_id(self, vehicle_id: UUID, for_update: bool = False) -> Vehicle | None:
        ...

    async def get_vehicle_by_registration(self, organization_id: UUID, reg_num: str) -> Vehicle | None:
        ...

    async def save_vehicle(self, vehicle: Vehicle) -> Vehicle:
        ...

    async def list_vehicles(self, organization_id: UUID | None = None, is_active: bool | None = None) -> list[Vehicle]:
        ...

    async def get_driver_by_id(self, driver_id: UUID, for_update: bool = False) -> Driver | None:
        ...

    async def save_driver(self, driver: Driver) -> Driver:
        ...

    async def list_drivers(self, organization_id: UUID, is_active: bool | None = None) -> list[Driver]:
        ...

    async def get_commitment_by_id(self, commitment_id: UUID) -> DeliveryCommitment | None:
        ...

    async def save_commitment(self, commitment: DeliveryCommitment) -> DeliveryCommitment:
        ...

    async def list_commitments(self, organization_id: UUID, status: str | None = None) -> list[DeliveryCommitment]:
        ...

    async def update_commitment_status(
        self,
        commitment_id: UUID,
        status: DeliveryStatus,
        delivered_units: int | None = None,
        shortage_reason: str | None = None,
        recipient_name: str | None = None,
        recipient_organization: str | None = None,
        pod_timestamp: datetime | None = None,
        pod_signature_acknowledgement: str | None = None,
        delivery_condition: str | None = None,
    ) -> DeliveryCommitment | None:
        ...

    async def is_vehicle_dispatched(self, vehicle_id: UUID) -> bool:
        ...

    async def is_driver_dispatched(self, driver_id: UUID) -> bool:
        ...

    async def get_driver_by_user_id(self, user_id: UUID) -> Driver | None:
        ...

    async def get_trip_by_id(self, trip_id: UUID, for_update: bool = False) -> Trip | None:
        ...

    async def save_trip(self, trip: Trip) -> Trip:
        ...

    async def update_trip_status(
        self,
        trip_id: UUID,
        status: TripStatus,
        cancellation_reason: str | None = None,
    ) -> Trip:
        ...

    async def list_trips(self, organization_id: UUID, status: TripStatus | None = None) -> list[Trip]:
        ...
