"""
app/modules/logistics/api/schemas.py — Pydantic DTOs for Logistics API.
"""

from __future__ import annotations

from datetime import datetime, timezone
from uuid import UUID

from pydantic import BaseModel, Field

from app.modules.logistics.domain.entities import (
    calculate_sla_status,
    mask_license,
    mask_phone,
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


class VehicleCreateRequest(BaseModel):
    registration_number: str = Field(..., min_length=2, max_length=32)
    vehicle_type: VehicleType
    make_model: str = Field(..., min_length=2, max_length=128)
    max_weight_kg: float = Field(..., gt=0.0)
    empty_weight_kg: float = Field(..., gt=0.0)
    height_m: float = Field(..., gt=0.0)
    width_m: float = Field(..., gt=0.0)
    length_m: float = Field(..., gt=0.0)
    axle_count: int = Field(..., ge=2)
    is_hazmat_capable: bool = False
    is_refrigerated: bool = False


class VehicleResponse(BaseModel):
    id: UUID
    organization_id: UUID
    registration_number: str
    vehicle_type: VehicleType
    make_model: str
    max_weight_kg: float
    empty_weight_kg: float
    height_m: float
    width_m: float
    length_m: float
    axle_count: int
    is_hazmat_capable: bool
    is_refrigerated: bool
    is_active: bool
    created_at: datetime


class DriverCreateRequest(BaseModel):
    full_name: str = Field(..., min_length=2, max_length=128)
    phone_e164: str = Field(..., min_length=8, max_length=32)
    license_number: str = Field(..., min_length=4, max_length=64)
    license_classes: list[str] = Field(default_factory=list)
    user_id: UUID | None = None


class DriverResponse(BaseModel):
    id: UUID
    organization_id: UUID
    user_id: UUID | None
    full_name: str
    phone_e164: str
    license_number: str
    license_classes: list[str]
    is_active: bool
    created_at: datetime

    @classmethod
    def from_entity(cls, driver, can_view_pii: bool = False) -> DriverResponse:
        return cls(
            id=driver.id,
            organization_id=driver.organization_id,
            user_id=driver.user_id,
            full_name=driver.full_name,
            phone_e164=driver.phone_e164 if can_view_pii else mask_phone(driver.phone_e164),
            license_number=driver.license_number if can_view_pii else mask_license(driver.license_number),
            license_classes=driver.license_classes,
            is_active=driver.is_active,
            created_at=driver.created_at,
        )


class CommitmentCreateRequest(BaseModel):
    consignment_reference: str = Field(..., min_length=2, max_length=64)
    cargo_category: CargoCategory
    priority_tier: PriorityTier
    consigned_weight_kg: float = Field(..., gt=0.0)
    consigned_quantity_units: int = Field(..., ge=1)
    origin_facility_id: UUID
    destination_facility_id: UUID
    required_before: datetime
    consigned_volume_m3: float | None = None


class CommitmentResponse(BaseModel):
    id: UUID
    organization_id: UUID
    consignment_reference: str
    cargo_category: CargoCategory
    priority_tier: PriorityTier
    consigned_weight_kg: float
    consigned_volume_m3: float | None
    consigned_quantity_units: int
    delivered_quantity_units: int
    origin_facility_id: UUID
    destination_facility_id: UUID
    required_before: datetime
    status: DeliveryStatus
    sla_status: SlaStatus
    shortage_reason: str | None
    created_at: datetime

    @classmethod
    def from_entity(cls, comm) -> CommitmentResponse:
        sla = calculate_sla_status(comm.required_before, comm.status, datetime.now(timezone.utc))
        return cls(
            id=comm.id,
            organization_id=comm.organization_id,
            consignment_reference=comm.consignment_reference,
            cargo_category=comm.cargo_category,
            priority_tier=comm.priority_tier,
            consigned_weight_kg=comm.consigned_weight_kg,
            consigned_volume_m3=comm.consigned_volume_m3,
            consigned_quantity_units=comm.consigned_quantity_units,
            delivered_quantity_units=comm.delivered_quantity_units,
            origin_facility_id=comm.origin_facility_id,
            destination_facility_id=comm.destination_facility_id,
            required_before=comm.required_before,
            status=comm.status,
            sla_status=sla,
            shortage_reason=comm.shortage_reason,
            created_at=comm.created_at,
        )


class TripStopInput(BaseModel):
    stop_type: StopType
    facility_id: UUID | None = None
    lat: float = Field(..., ge=-90.0, le=90.0)
    lon: float = Field(..., ge=-180.0, le=180.0)
    planned_arrival: datetime
    planned_departure: datetime


class DispatchTripRequest(BaseModel):
    vehicle_id: UUID
    driver_id: UUID
    trip_code: str = Field(..., min_length=2, max_length=64)
    scheduled_departure: datetime
    stops: list[TripStopInput] = Field(..., min_length=2)
    commitment_ids: list[UUID] = Field(default_factory=list)
    current_route_snapshot_id: UUID | None = None


class TripStopResponse(BaseModel):
    id: UUID
    trip_id: UUID
    sequence_order: int
    stop_type: StopType
    facility_id: UUID | None
    lat: float
    lon: float
    planned_arrival: datetime
    planned_departure: datetime
    actual_arrival: datetime | None
    actual_departure: datetime | None
    status: StopStatus


class TripResponse(BaseModel):
    id: UUID
    organization_id: UUID
    vehicle_id: UUID
    driver_id: UUID
    trip_code: str
    status: TripStatus
    current_route_snapshot_id: UUID | None
    scheduled_departure: datetime
    actual_departure: datetime | None
    actual_arrival: datetime | None
    created_at: datetime
    stops: list[TripStopResponse]
    commitment_ids: list[UUID]


class TripTransitionRequest(BaseModel):
    target_status: TripStatus
