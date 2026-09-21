"""
tests/unit/routing/test_routing_domain.py — Unit tests for Routing domain logic, curfew rules, and constraints.
"""

from __future__ import annotations

from datetime import datetime, time, timezone
import uuid
import zoneinfo

import pytest

from app.modules.routing.domain.entities import VehicleConstraints, is_in_curfew
from app.modules.routing.domain.enums import PolicyVersion


class TestCurfewTimeChecks:
    def test_curfew_active_at_night_in_kolkata(self) -> None:
        """23:00 IST is 17:30 UTC on the same day. Curfew 21:00-05:00 IST is active."""
        kolkata_tz = zoneinfo.ZoneInfo("Asia/Kolkata")
        dt_night = datetime(2026, 9, 21, 23, 0, 0, tzinfo=kolkata_tz)
        dt_utc = dt_night.astimezone(timezone.utc)

        # 0 travel seconds, departure at 23:00 IST
        in_curfew = is_in_curfew(
            departure_time=dt_utc,
            accumulated_seconds=0,
            curfew_start_time=time(21, 0),
            curfew_end_time=time(5, 0),
        )
        assert in_curfew is True

    def test_curfew_inactive_at_afternoon_in_kolkata(self) -> None:
        """14:00 IST is 08:30 UTC. Curfew 21:00-05:00 IST is NOT active."""
        kolkata_tz = zoneinfo.ZoneInfo("Asia/Kolkata")
        dt_day = datetime(2026, 9, 21, 14, 0, 0, tzinfo=kolkata_tz)
        dt_utc = dt_day.astimezone(timezone.utc)

        in_curfew = is_in_curfew(
            departure_time=dt_utc,
            accumulated_seconds=0,
            curfew_start_time=time(21, 0),
            curfew_end_time=time(5, 0),
        )
        assert in_curfew is False

    def test_curfew_early_morning_boundary(self) -> None:
        """04:59 IST is within curfew; 05:01 IST is outside."""
        kolkata_tz = zoneinfo.ZoneInfo("Asia/Kolkata")
        dt_inside = datetime(2026, 9, 21, 4, 59, 0, tzinfo=kolkata_tz)
        dt_outside = datetime(2026, 9, 21, 5, 1, 0, tzinfo=kolkata_tz)

        in_curfew_1 = is_in_curfew(
            departure_time=dt_inside.astimezone(timezone.utc),
            accumulated_seconds=0,
            curfew_start_time=time(21, 0),
            curfew_end_time=time(5, 0),
        )
        in_curfew_2 = is_in_curfew(
            departure_time=dt_outside.astimezone(timezone.utc),
            accumulated_seconds=0,
            curfew_start_time=time(21, 0),
            curfew_end_time=time(5, 0),
        )

        assert in_curfew_1 is True
        assert in_curfew_2 is False


class TestVehicleConstraints:
    def test_vehicle_constraints_instantiation(self) -> None:
        dt = datetime(2026, 9, 21, 12, 0, 0, tzinfo=timezone.utc)
        veh_id = uuid.uuid4()
        vc = VehicleConstraints(
            vehicle_id=veh_id,
            max_weight_kg=24500.0,
            height_m=4.2,
            is_hazmat=True,
            cargo_priority="TIER_1_CRITICAL",
            departure_time=dt,
        )
        assert vc.vehicle_id == veh_id
        assert vc.max_weight_kg == 24500.0
        assert vc.height_m == 4.2
        assert vc.is_hazmat is True
        assert vc.cargo_priority == "TIER_1_CRITICAL"
        assert vc.departure_time == dt
