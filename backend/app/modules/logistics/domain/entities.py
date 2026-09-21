"""
app/modules/logistics/domain/entities.py — Domain entities & business rules for Logistics.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
import re
from uuid import UUID

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


@dataclass(frozen=True)
class Vehicle:
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
    updated_at: datetime


@dataclass(frozen=True)
class Driver:
    id: UUID
    organization_id: UUID
    user_id: UUID | None
    full_name: str
    phone_e164: str
    license_number: str
    license_classes: list[str]
    is_active: bool
    created_at: datetime
    updated_at: datetime


@dataclass(frozen=True)
class DeliveryCommitment:
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
    shortage_reason: str | None
    created_at: datetime
    updated_at: datetime


@dataclass(frozen=True)
class TripStop:
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


@dataclass(frozen=True)
class Trip:
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
    updated_at: datetime
    stops: list[TripStop] = field(default_factory=list)
    commitment_ids: list[UUID] = field(default_factory=list)


# ──────────────────────────────────────────────────────────────
# Pure Domain Business Rules & Calculations
# ──────────────────────────────────────────────────────────────

VALID_TRIP_TRANSITIONS: dict[TripStatus, set[TripStatus]] = {
    TripStatus.PLANNED: {TripStatus.DISPATCHED, TripStatus.CANCELLED},
    TripStatus.DISPATCHED: {TripStatus.IN_TRANSIT, TripStatus.DIVERTED, TripStatus.ABORTED, TripStatus.CANCELLED},
    TripStatus.IN_TRANSIT: {TripStatus.HELD_FOR_INSPECTION, TripStatus.DIVERTED, TripStatus.COMPLETED, TripStatus.ABORTED},
    TripStatus.HELD_FOR_INSPECTION: {TripStatus.IN_TRANSIT, TripStatus.DIVERTED, TripStatus.ABORTED},
    TripStatus.DIVERTED: {TripStatus.IN_TRANSIT, TripStatus.COMPLETED, TripStatus.ABORTED},
    TripStatus.COMPLETED: set(),
    TripStatus.CANCELLED: set(),
    TripStatus.ABORTED: set(),
}


def validate_trip_state_transition(current: TripStatus, target: TripStatus) -> bool:
    """Validate if trip state transition is legal under finite state machine."""
    allowed = VALID_TRIP_TRANSITIONS.get(current, set())
    return target in allowed


def calculate_sla_status(
    required_before: datetime,
    current_status: DeliveryStatus,
    now_utc: datetime | None = None,
) -> SlaStatus:
    """
    Calculate dynamic SLA status based on SLA deadline and delivery status:
    - If already DELIVERED: remains ON_TIME.
    - If now >= required_before: BREACHED.
    - If now >= required_before - 2 hours: AT_RISK.
    - Otherwise: ON_TIME.
    """
    if current_status == DeliveryStatus.DELIVERED:
        return SlaStatus.ON_TIME

    if now_utc is None:
        now_utc = datetime.now(timezone.utc)

    # Ensure timezone awareness
    if required_before.tzinfo is None:
        required_before = required_before.replace(tzinfo=timezone.utc)
    if now_utc.tzinfo is None:
        now_utc = now_utc.replace(tzinfo=timezone.utc)

    remaining_seconds = (required_before - now_utc).total_seconds()
    if remaining_seconds <= 0:
        return SlaStatus.BREACHED
    elif remaining_seconds <= 7200:  # 2 hours
        return SlaStatus.AT_RISK
    return SlaStatus.ON_TIME


def mask_phone(phone_e164: str) -> str:
    """
    Mask phone number for PII protection:
    e.g. '+919876543210' -> '+91 98765 *****'
    """
    digits = re.sub(r"[^\d]", "", phone_e164)
    if len(digits) >= 10:
        prefix = digits[:-5]
        return f"+{prefix[:2]} {prefix[2:]} *****"
    return "*****"


def mask_license(license_number: str) -> str:
    """
    Mask driver license number:
    e.g. 'AS01-20210049210' -> 'AS01-****-9210'
    """
    clean = license_number.strip()
    if len(clean) >= 8:
        return f"{clean[:4]}-****-{clean[-4:]}"
    return "****"
