"""
tests/unit/telemetry/test_telemetry_domain.py — Pure domain unit tests for Telemetry.
"""

from datetime import datetime, timedelta, timezone
import math
import pytest

from app.modules.telemetry.domain.entities import (
    derive_stale_status,
    get_source_rank,
    haversine_distance_m,
    validate_coordinates,
)
from app.modules.telemetry.domain.enums import DeviceType, StaleStatus


class TestStaleStatusDerivation:
    def test_fresh_under_5_minutes(self):
        now = datetime(2026, 9, 21, 12, 0, 0, tzinfo=timezone.utc)
        event_time = now - timedelta(minutes=2)
        assert derive_stale_status(event_time, now) == StaleStatus.FRESH

    def test_aging_between_5_and_15_minutes(self):
        now = datetime(2026, 9, 21, 12, 0, 0, tzinfo=timezone.utc)
        event_time = now - timedelta(minutes=8)
        assert derive_stale_status(event_time, now) == StaleStatus.AGING

    def test_stale_warning_between_15_and_60_minutes(self):
        now = datetime(2026, 9, 21, 12, 0, 0, tzinfo=timezone.utc)
        event_time = now - timedelta(minutes=35)
        assert derive_stale_status(event_time, now) == StaleStatus.STALE_WARNING

    def test_feed_offline_past_60_minutes(self):
        now = datetime(2026, 9, 21, 12, 0, 0, tzinfo=timezone.utc)
        event_time = now - timedelta(hours=2)
        assert derive_stale_status(event_time, now) == StaleStatus.FEED_OFFLINE


class TestCoordinateValidation:
    def test_valid_point_succeeds(self):
        valid, err = validate_coordinates(26.1152, 91.8153, 175.0, 45.0)
        assert valid is True
        assert err is None

    def test_nan_coordinate_rejected(self):
        valid, err = validate_coordinates(float("nan"), 91.8153, 0.0, 30.0)
        assert valid is False
        assert "NaN" in err

    def test_inf_speed_rejected(self):
        valid, err = validate_coordinates(26.1152, 91.8153, 0.0, float("inf"))
        assert valid is False
        assert "Inf" in err

    def test_out_of_range_latitude_rejected(self):
        valid, err = validate_coordinates(95.0, 91.8153, 0.0, 30.0)
        assert valid is False
        assert "Latitude" in err

    def test_out_of_range_longitude_rejected(self):
        valid, err = validate_coordinates(26.1152, 195.0, 0.0, 30.0)
        assert valid is False
        assert "Longitude" in err

    def test_negative_speed_rejected(self):
        valid, err = validate_coordinates(26.1152, 91.8153, 0.0, -10.0)
        assert valid is False
        assert "Speed" in err

    def test_heading_out_of_range_rejected(self):
        valid, err = validate_coordinates(26.1152, 91.8153, 360.0, 30.0)
        assert valid is False
        assert "Heading" in err


class TestSourcePrecedence:
    def test_ranks_order(self):
        obd_rank = get_source_rank(DeviceType.HARDWARE_OBD_CELLULAR)
        gateway_rank = get_source_rank(DeviceType.EXTERNAL_GPS_GATEWAY)
        mobile_rank = get_source_rank(DeviceType.MOBILE_APP_DRIVER)
        sim_rank = get_source_rank(DeviceType.LABELED_SIMULATOR_REPLAY)

        assert obd_rank < gateway_rank < mobile_rank < sim_rank
        assert obd_rank == 1
        assert sim_rank == 4


class TestHaversineDistance:
    def test_same_point_is_zero(self):
        dist = haversine_distance_m(26.1152, 91.8153, 26.1152, 91.8153)
        assert dist == pytest.approx(0.0, abs=1e-3)

    def test_distance_byrnihat_to_nongpoh(self):
        # Byrnihat: (26.0821, 91.8684) to Nongpoh: (25.9080, 91.8795)
        # Expected straight-line distance is approx 19.4 km
        dist = haversine_distance_m(26.0821, 91.8684, 25.9080, 91.8795)
        assert 18000.0 < dist < 21000.0
