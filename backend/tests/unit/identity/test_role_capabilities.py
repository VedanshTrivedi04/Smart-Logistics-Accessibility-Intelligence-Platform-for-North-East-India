"""
tests/unit/identity/test_role_capabilities.py — Unit tests for ROLE_CAPABILITY_MAP.

Verifies:
- All 11 canonical roles have defined baseline capabilities
- Acceptance Gate requirements:
  - LOCAL_AUTHORITY does NOT have VERIFY_REPORT by default (test #23)
  - PLATFORM_ADMINISTRATOR does NOT have VIEW_REPORT_MEDIA by default (test #24)
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

    def test_local_authority_does_not_have_verify_report_default(self) -> None:
        caps = get_role_baseline_capabilities(Role.LOCAL_AUTHORITY)
        assert Capability.VERIFY_REPORT not in caps
        assert Capability.SUBMIT_REPORT in caps

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

    def test_transport_operator_has_submit_gps_only_logistics(self) -> None:
        caps = get_role_baseline_capabilities(Role.TRANSPORT_OPERATOR)
        assert Capability.SUBMIT_GPS in caps
        assert Capability.DISPATCH_ROUTE not in caps
        assert Capability.COMPUTE_ROUTE not in caps

    def test_fleet_manager_has_dispatch_and_fleet(self) -> None:
        caps = get_role_baseline_capabilities(Role.FLEET_MANAGER)
        assert Capability.DISPATCH_ROUTE in caps
        assert Capability.VIEW_FLEET in caps
        assert Capability.COMPUTE_ROUTE in caps

    def test_regional_authority_has_aggregated_summary_only(self) -> None:
        caps = get_role_baseline_capabilities(Role.REGIONAL_AUTHORITY)
        assert Capability.VIEW_REPORT_SUMMARY in caps
        assert Capability.VIEW_REPORT_DETAIL not in caps
        assert Capability.VIEW_REPORT_MEDIA not in caps

    def test_state_authority_has_override_verification(self) -> None:
        caps = get_role_baseline_capabilities(Role.STATE_AUTHORITY)
        assert Capability.OVERRIDE_VERIFICATION in caps
        assert Capability.VIEW_REPORT_DETAIL in caps
