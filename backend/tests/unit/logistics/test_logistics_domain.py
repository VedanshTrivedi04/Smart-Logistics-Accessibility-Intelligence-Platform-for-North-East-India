"""
tests/unit/logistics/test_logistics_domain.py — Pure domain unit tests for Fleet Logistics.
"""

from datetime import datetime, timedelta, timezone
import pytest
from uuid import uuid4

from app.modules.logistics.domain.entities import (
    calculate_sla_status,
    mask_license,
    mask_phone,
    validate_trip_state_transition,
)
from app.modules.logistics.domain.enums import (
    DeliveryStatus,
    SlaStatus,
    TripStatus,
)


class TestTripStateTransitions:
    def test_planned_to_dispatched_allowed(self):
        assert validate_trip_state_transition(TripStatus.PLANNED, TripStatus.DISPATCHED) is True

    def test_planned_to_cancelled_allowed(self):
        assert validate_trip_state_transition(TripStatus.PLANNED, TripStatus.CANCELLED) is True

    def test_planned_to_completed_forbidden(self):
        assert validate_trip_state_transition(TripStatus.PLANNED, TripStatus.COMPLETED) is False

    def test_dispatched_to_in_transit_allowed(self):
        assert validate_trip_state_transition(TripStatus.DISPATCHED, TripStatus.IN_TRANSIT) is True

    def test_in_transit_to_completed_allowed(self):
        assert validate_trip_state_transition(TripStatus.IN_TRANSIT, TripStatus.COMPLETED) is True

    def test_in_transit_to_diverted_allowed(self):
        assert validate_trip_state_transition(TripStatus.IN_TRANSIT, TripStatus.DIVERTED) is True

    def test_completed_is_terminal(self):
        assert validate_trip_state_transition(TripStatus.COMPLETED, TripStatus.IN_TRANSIT) is False
        assert validate_trip_state_transition(TripStatus.COMPLETED, TripStatus.DISPATCHED) is False

    def test_cancelled_is_terminal(self):
        assert validate_trip_state_transition(TripStatus.CANCELLED, TripStatus.PLANNED) is False


class TestSlaCalculation:
    def test_on_time_when_deadline_distant(self):
        now = datetime(2026, 9, 21, 12, 0, tzinfo=timezone.utc)
        deadline = now + timedelta(hours=5)
        status = calculate_sla_status(deadline, DeliveryStatus.PENDING, now)
        assert status == SlaStatus.ON_TIME

    def test_at_risk_within_two_hours(self):
        now = datetime(2026, 9, 21, 12, 0, tzinfo=timezone.utc)
        deadline = now + timedelta(minutes=90)
        status = calculate_sla_status(deadline, DeliveryStatus.IN_TRANSIT, now)
        assert status == SlaStatus.AT_RISK

    def test_breached_when_past_deadline(self):
        now = datetime(2026, 9, 21, 12, 0, tzinfo=timezone.utc)
        deadline = now - timedelta(minutes=10)
        status = calculate_sla_status(deadline, DeliveryStatus.IN_TRANSIT, now)
        assert status == SlaStatus.BREACHED

    def test_delivered_always_on_time(self):
        now = datetime(2026, 9, 21, 12, 0, tzinfo=timezone.utc)
        deadline = now - timedelta(hours=2)
        status = calculate_sla_status(deadline, DeliveryStatus.DELIVERED, now)
        assert status == SlaStatus.ON_TIME


class TestDriverPiiMasking:
    def test_phone_masking_standard_e164(self):
        assert mask_phone("+919864012345") == "+91 98640 *****"
        assert mask_phone("+919435098765") == "+91 94350 *****"

    def test_phone_masking_short_or_invalid(self):
        assert mask_phone("1234") == "*****"

    def test_license_masking_standard(self):
        assert mask_license("AS-01-20150039211") == "AS-0-****-9211"
        assert mask_license("ML05-2020-12948") == "ML05-****-2948"

    def test_license_masking_short(self):
        assert mask_license("123") == "****"
