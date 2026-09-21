"""
tests/unit/network/test_traversability.py — Unit Tests for Pure Domain Traversability Rules.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone

import pytest

from app.modules.network.domain.entities import (
    EdgeRestriction,
    RoadEdge,
    TraversabilityResult,
    VehicleProfile,
)
from app.modules.network.domain.enums import (
    AccessibilityStatus,
    RestrictionKind,
    RoadClass,
    SurfaceType,
)
from app.modules.network.domain.traversability import evaluate_traversability


def make_dummy_edge(is_bridge: bool = False, is_one_way: bool = False) -> RoadEdge:
    return RoadEdge(
        id=uuid.uuid4(),
        network_version_id=uuid.uuid4(),
        edge_index=1,
        source_node_id=uuid.uuid4(),
        target_node_id=uuid.uuid4(),
        source_index=1,
        target_index=2,
        coordinates=[(91.7, 26.1), (91.8, 26.0)],
        length_meters=10000.0,
        road_class=RoadClass.NATIONAL_HIGHWAY,
        surface_type=SurfaceType.PAVED_ASPHALT,
        speed_limit_kmh=60,
        base_seconds=600.0,
        reverse_base_seconds=-1.0 if is_one_way else 600.0,
        is_bridge=is_bridge,
    )


class TestTraversabilityRules:
    def test_open_edge_is_traversable(self) -> None:
        vehicle = VehicleProfile(gross_weight_tonnes=10.0, height_meters=3.0)
        edge = make_dummy_edge()
        result = evaluate_traversability(vehicle, edge, AccessibilityStatus.OPEN, [])
        assert result.can_traverse is True
        assert result.requires_review is False
        assert result.delay_penalty_seconds == 0.0

    def test_blocked_edge_is_always_excluded(self) -> None:
        vehicle = VehicleProfile()
        edge = make_dummy_edge()
        result = evaluate_traversability(vehicle, edge, AccessibilityStatus.BLOCKED, [])
        assert result.can_traverse is False
        assert "Verified road closure" in result.reason

    def test_provisional_caution_blocks_critical_dispatch(self) -> None:
        vehicle = VehicleProfile(is_critical_dispatch=True)
        edge = make_dummy_edge()
        result = evaluate_traversability(vehicle, edge, AccessibilityStatus.PROVISIONAL_CAUTION, [])
        assert result.can_traverse is False
        assert result.requires_review is True
        assert "Provisional caution" in result.reason

    def test_provisional_caution_allows_regular_dispatch(self) -> None:
        vehicle = VehicleProfile(is_critical_dispatch=False)
        edge = make_dummy_edge()
        result = evaluate_traversability(vehicle, edge, AccessibilityStatus.PROVISIONAL_CAUTION, [])
        assert result.can_traverse is True

    def test_unknown_status_requires_review(self) -> None:
        vehicle = VehicleProfile()
        edge = make_dummy_edge()
        result = evaluate_traversability(vehicle, edge, AccessibilityStatus.UNKNOWN, [])
        assert result.can_traverse is False
        assert result.requires_review is True

    def test_bridge_abstention_for_heavy_vehicle_without_weight_limit(self) -> None:
        """Systemdesign.md line 197: Unknown critical bridge limits cause abstention, not safe default."""
        vehicle = VehicleProfile(gross_weight_tonnes=25.0, is_heavy_vehicle=True)
        edge = make_dummy_edge(is_bridge=True)
        result = evaluate_traversability(vehicle, edge, AccessibilityStatus.OPEN, restrictions=[])
        assert result.can_traverse is False
        assert result.requires_review is True
        assert "Bridge structural capacity unknown" in result.reason

    def test_bridge_allows_heavy_vehicle_within_limit(self) -> None:
        vehicle = VehicleProfile(gross_weight_tonnes=25.0, is_heavy_vehicle=True)
        edge = make_dummy_edge(is_bridge=True)
        restriction = EdgeRestriction(
            id=uuid.uuid4(),
            edge_id=edge.id,
            kind=RestrictionKind.MAX_WEIGHT,
            value_numeric=40.0,
        )
        result = evaluate_traversability(vehicle, edge, AccessibilityStatus.OPEN, [restriction])
        assert result.can_traverse is True

    def test_vehicle_weight_exceeds_restriction(self) -> None:
        vehicle = VehicleProfile(gross_weight_tonnes=35.0)
        edge = make_dummy_edge()
        restriction = EdgeRestriction(
            id=uuid.uuid4(),
            edge_id=edge.id,
            kind=RestrictionKind.MAX_WEIGHT,
            value_numeric=20.0,
        )
        result = evaluate_traversability(vehicle, edge, AccessibilityStatus.OPEN, [restriction])
        assert result.can_traverse is False
        assert "exceeds limit" in result.reason

    def test_vehicle_height_exceeds_restriction(self) -> None:
        vehicle = VehicleProfile(height_meters=4.5)
        edge = make_dummy_edge()
        restriction = EdgeRestriction(
            id=uuid.uuid4(),
            edge_id=edge.id,
            kind=RestrictionKind.MAX_HEIGHT,
            value_numeric=4.0,
        )
        result = evaluate_traversability(vehicle, edge, AccessibilityStatus.OPEN, [restriction])
        assert result.can_traverse is False
        assert "exceeds vertical clearance" in result.reason

    def test_hazardous_cargo_prohibited(self) -> None:
        vehicle = VehicleProfile(is_hazardous_cargo=True)
        edge = make_dummy_edge()
        restriction = EdgeRestriction(
            id=uuid.uuid4(),
            edge_id=edge.id,
            kind=RestrictionKind.HAZARDOUS_CARGO_PROHIBITED,
        )
        result = evaluate_traversability(vehicle, edge, AccessibilityStatus.OPEN, [restriction])
        assert result.can_traverse is False
        assert "Hazardous cargo transit prohibited" in result.reason

    def test_night_curfew_in_effect_at_night(self) -> None:
        vehicle = VehicleProfile()
        edge = make_dummy_edge()
        restriction = EdgeRestriction(
            id=uuid.uuid4(),
            edge_id=edge.id,
            kind=RestrictionKind.NIGHT_CURFEW,
        )
        night_time = datetime(2026, 9, 21, 22, 30, tzinfo=timezone.utc)
        result = evaluate_traversability(vehicle, edge, AccessibilityStatus.OPEN, [restriction], effective_time=night_time)
        assert result.can_traverse is False
        assert "curfew" in result.reason.lower()

    def test_night_curfew_not_in_effect_during_day(self) -> None:
        vehicle = VehicleProfile()
        edge = make_dummy_edge()
        restriction = EdgeRestriction(
            id=uuid.uuid4(),
            edge_id=edge.id,
            kind=RestrictionKind.NIGHT_CURFEW,
        )
        day_time = datetime(2026, 9, 21, 14, 0, tzinfo=timezone.utc)
        result = evaluate_traversability(vehicle, edge, AccessibilityStatus.OPEN, [restriction], effective_time=day_time)
        assert result.can_traverse is True

    def test_restricted_status_adds_delay_penalty(self) -> None:
        vehicle = VehicleProfile()
        edge = make_dummy_edge()
        result = evaluate_traversability(vehicle, edge, AccessibilityStatus.RESTRICTED, [])
        assert result.can_traverse is True
        assert result.delay_penalty_seconds > 0.0
