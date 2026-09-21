"""
app/modules/logistics/application/update_trip_status.py — Update trip lifecycle status use case.
"""

from __future__ import annotations

from uuid import UUID

from app.modules.logistics.application.ports import LogisticsRepositoryPort
from app.modules.logistics.domain.entities import Trip, validate_trip_state_transition
from app.modules.logistics.domain.enums import TripStatus
from app.modules.logistics.domain.exceptions import (
    InvalidTripStateTransitionError,
    TripNotFoundError,
)


class UpdateTripStatusUseCase:
    def __init__(self, repository: LogisticsRepositoryPort):
        self.repository = repository

    async def execute(self, trip_id: UUID, target_status: TripStatus) -> Trip:
        trip = await self.repository.get_trip_by_id(trip_id, for_update=True)
        if trip is None:
            raise TripNotFoundError(f"Trip '{trip_id}' not found")

        if not validate_trip_state_transition(trip.status, target_status):
            raise InvalidTripStateTransitionError(
                f"Cannot transition trip from '{trip.status.value}' to '{target_status.value}'"
            )

        return await self.repository.update_trip_status(trip_id, target_status)
