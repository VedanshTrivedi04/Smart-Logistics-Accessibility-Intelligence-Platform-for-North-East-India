"""
app/modules/logistics/domain/exceptions.py — Domain exceptions for Logistics.
"""

from __future__ import annotations

from app.core.exceptions import (
    ConflictError,
    NotFoundError,
    UnprocessableError,
)


class VehicleNotFoundError(NotFoundError):
    code = "VEHICLE_NOT_FOUND"

    def __init__(self, message: str = "Vehicle not found"):
        super().__init__(message=message, code=self.code)


class DriverNotFoundError(NotFoundError):
    code = "DRIVER_NOT_FOUND"

    def __init__(self, message: str = "Driver not found"):
        super().__init__(message=message, code=self.code)


class TripNotFoundError(NotFoundError):
    code = "TRIP_NOT_FOUND"

    def __init__(self, message: str = "Trip not found"):
        super().__init__(message=message, code=self.code)


class CommitmentNotFoundError(NotFoundError):
    code = "COMMITMENT_NOT_FOUND"

    def __init__(self, message: str = "Delivery commitment not found"):
        super().__init__(message=message, code=self.code)


class ResourceAlreadyDispatchedError(ConflictError):
    code = "RESOURCE_ALREADY_DISPATCHED"

    def __init__(self, message: str = "Driver or vehicle is already assigned to an active trip"):
        super().__init__(message=message, code=self.code)


class VehicleCapacityExceededError(UnprocessableError):
    code = "VEHICLE_CAPACITY_EXCEEDED"

    def __init__(self, message: str = "Total cargo weight exceeds vehicle maximum payload capacity"):
        super().__init__(message=message, code=self.code)


class VehicleHazmatIncapableError(UnprocessableError):
    code = "VEHICLE_HAZMAT_INCAPABLE"

    def __init__(self, message: str = "Consignment requires hazmat/refrigerated capable vehicle"):
        super().__init__(message=message, code=self.code)


class InvalidTripStateTransitionError(ConflictError):
    code = "INVALID_TRIP_STATE_TRANSITION"

    def __init__(self, message: str = "Illegal trip state transition"):
        super().__init__(message=message, code=self.code)


class DuplicateRegistrationError(ConflictError):
    code = "DUPLICATE_VEHICLE_REGISTRATION"

    def __init__(self, message: str = "Vehicle registration number already exists in organization"):
        super().__init__(message=message, code=self.code)
