"""
tests/unit/identity/test_role_capabilities.py — Unit tests for ROLE_CAPABILITY_MAP.

Verifies:
- All canonical roles have defined baseline capabilities
- Acceptance Gate requirements:
  - FIELD_OFFICER does NOT have VERIFY_REPORT by default
  - PLATFORM_ADMINISTRATOR does NOT have VIEW_REPORT_MEDIA by default (test #24)
  - ROAD_INSPECTION has CONDUCT_INSPECTION and VERIFY_REPORT
"""

from __future__ import annotations

import pytest

from app.modules.identity.domain.enums import Capability, Role
from app.modules.identity.domain.role_capabilities import (
    ROLE_CAPABILITY_MAP,
    get_role_baseline_capabilities,
)


class TestRoleCapabilities:
    @pytest.mark.parametrize("role", list(Role))
    def test_all_11_roles_are_mapped(self, role: Role) -> None:
        assert role in ROLE_CAPABILITY_MAP
        caps = get_role_baseline_capabilities(role)
        assert isinstance(caps, frozenset)
        assert len(caps) > 0

    def test_field_officer_does_not_have_verify_report_default(self) -> None:
        caps = get_role_baseline_capabilities(Role.FIELD_OFFICER)
        assert Capability.VERIFY_REPORT not in caps
        assert Capability.SUBMIT_REPORT in caps

    def test_road_inspection_has_inspection_capabilities(self) -> None:
        caps = get_role_baseline_capabilities(Role.ROAD_INSPECTION)
        assert Capability.CONDUCT_INSPECTION in caps
        assert Capability.VERIFY_REPORT in caps
        assert Capability.UPDATE_ROAD_STATUS in caps

    def test_platform_administrator_does_not_have_view_report_media_default(self) -> None:
        caps = get_role_baseline_capabilities(Role.PLATFORM_ADMINISTRATOR)
        assert Capability.VIEW_REPORT_MEDIA not in caps
        assert Capability.MANAGE_IDENTITY in caps
        assert Capability.MANAGE_GRANTS in caps

    def test_district_verifier_has_verification_and_media_capabilities(self) -> None:
        caps = get_role_baseline_capabilities(Role.DISTRICT_VERIFIER)
        assert Capability.VERIFY_REPORT in caps
        assert Capability.VIEW_REPORT_DETAIL in caps
        assert Capability.VIEW_REPORT_MEDIA in caps

    def test_field_officer_can_submit_but_cannot_verify(self) -> None:
        caps = get_role_baseline_capabilities(Role.FIELD_OFFICER)
        assert Capability.SUBMIT_REPORT in caps
        assert Capability.VERIFY_REPORT not in caps

    def test_transport_operator_has_submit_gps_and_view_fleet(self) -> None:
        caps = get_role_baseline_capabilities(Role.TRANSPORT_OPERATOR)
        assert Capability.SUBMIT_GPS in caps
        assert Capability.VIEW_FLEET in caps
        assert Capability.DISPATCH_ROUTE not in caps
        assert Capability.COMPUTE_ROUTE not in caps

    def test_delivery_coordinator_has_dispatch_route(self) -> None:
        caps = get_role_baseline_capabilities(Role.DELIVERY_COORDINATOR)
        assert Capability.DISPATCH_ROUTE in caps
        assert Capability.VIEW_FLEET in caps
        assert Capability.COMPUTE_ROUTE in caps

    def test_fleet_manager_has_dispatch_and_fleet(self) -> None:
        caps = get_role_baseline_capabilities(Role.FLEET_MANAGER)
        assert Capability.DISPATCH_ROUTE in caps
        assert Capability.VIEW_FLEET in caps
        assert Capability.COMPUTE_ROUTE in caps
        assert Capability.COORDINATE_RESPONSE in caps

    def test_regional_authority_has_aggregated_summary_only(self) -> None:
        caps = get_role_baseline_capabilities(Role.REGIONAL_AUTHORITY)
        assert Capability.VIEW_REPORT_SUMMARY in caps
        assert Capability.VIEW_REPORT_DETAIL not in caps
        assert Capability.VIEW_REPORT_MEDIA not in caps

    def test_state_authority_has_override_verification(self) -> None:
        caps = get_role_baseline_capabilities(Role.STATE_AUTHORITY)
        assert Capability.OVERRIDE_VERIFICATION in caps
        assert Capability.VIEW_REPORT_DETAIL in caps


class TestCoordinationCapability:
    @pytest.mark.parametrize(
        "role",
        [Role.REGIONAL_AUTHORITY, Role.STATE_AUTHORITY, Role.DISTRICT_VERIFIER, Role.EMERGENCY_COORDINATOR, Role.FLEET_MANAGER],
    )
    def test_government_and_fleet_coordinators_can_coordinate(self, role: Role) -> None:
        assert Capability.COORDINATE_RESPONSE in get_role_baseline_capabilities(role)

    @pytest.mark.parametrize(
        "role",
        [Role.FIELD_OFFICER, Role.DELIVERY_COORDINATOR, Role.TRANSPORT_OPERATOR, Role.PLATFORM_ADMINISTRATOR],
    )
    def test_other_roles_cannot_coordinate(self, role: Role) -> None:
        assert Capability.COORDINATE_RESPONSE not in get_role_baseline_capabilities(role)
