"""
app/modules/logistics/public.py — Public module contract for Logistics & Fleet.
"""

from __future__ import annotations

from app.modules.logistics.application.ports import LogisticsRepositoryPort
from app.modules.logistics.domain.entities import (
    DeliveryCommitment,
    Driver,
    Trip,
    TripStop,
    Vehicle,
    calculate_sla_status,
    mask_license,
    mask_phone,
    validate_trip_state_transition,
)
from app.modules.logistics.domain.enums import (
    CargoCategory,
    DeliveryStatus,
    PriorityTier,
    SlaStatus,
    StopStatus,
    StopType,
    TripStatus,
    VehicleType,
)
from app.modules.logistics.domain.exceptions import (
    CommitmentNotFoundError,
    DriverNotFoundError,
    DuplicateRegistrationError,
    InvalidTripStateTransitionError,
    ResourceAlreadyDispatchedError,
    TripNotFoundError,
    VehicleCapacityExceededError,
    VehicleHazmatIncapableError,
    VehicleNotFoundError,
)

__all__ = [
    "CargoCategory",
    "CommitmentNotFoundError",
    "DeliveryCommitment",
    "DeliveryStatus",
    "Driver",
    "DriverNotFoundError",
    "DuplicateRegistrationError",
    "InvalidTripStateTransitionError",
    "LogisticsRepositoryPort",
    "PriorityTier",
    "ResourceAlreadyDispatchedError",
    "SlaStatus",
    "StopStatus",
    "StopType",
    "Trip",
    "TripNotFoundError",
    "TripStatus",
    "TripStop",
    "Vehicle",
    "VehicleCapacityExceededError",
    "VehicleHazmatIncapableError",
    "VehicleNotFoundError",
    "VehicleType",
    "calculate_sla_status",
    "mask_license",
    "mask_phone",
    "validate_trip_state_transition",
]
