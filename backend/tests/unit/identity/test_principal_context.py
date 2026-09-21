"""
tests/unit/identity/test_principal_context.py — Unit tests for PrincipalContext.

Tests:
- Deny-by-default capability evaluation
- Jurisdiction boundary matching
- Sharing grant resolution
- Assignment context delegation
"""

from __future__ import annotations

import uuid
from uuid import UUID

import pytest

from app.modules.identity.domain.assignment_context import AssignmentContext
from app.modules.identity.domain.enums import Capability, OrgKind, ResourceKind, Role
from app.modules.identity.domain.principal import PrincipalContext, SharingGrantContext


@pytest.fixture
def base_principal() -> PrincipalContext:
    return PrincipalContext(
        user_id=uuid.uuid4(),
        org_id=uuid.uuid4(),
        org_name="Assam Field Authority",
        org_kind=OrgKind.FIELD_AUTHORITY,
        role=Role.FIELD_OFFICER,
        capabilities=frozenset({
            Capability.SUBMIT_REPORT,
            Capability.VIEW_REPORT_SUMMARY,
            Capability.VIEW_ROAD_STATUS,
        }),
        jurisdiction_ids=frozenset({
            UUID("00000003-0000-4000-8000-000000000001"),
        }),
    )


class TestPrincipalContext:
    def test_can_returns_true_for_granted_capability(self, base_principal: PrincipalContext) -> None:
        assert base_principal.can(Capability.SUBMIT_REPORT) is True
        assert base_principal.can(Capability.VIEW_ROAD_STATUS) is True

    def test_can_returns_false_for_unpossessed_capability_deny_by_default(
        self, base_principal: PrincipalContext
    ) -> None:
        assert base_principal.can(Capability.VERIFY_REPORT) is False
        assert base_principal.can(Capability.MANAGE_IDENTITY) is False
        assert base_principal.can(Capability.DISPATCH_ROUTE) is False

    def test_has_jurisdiction_returns_true_for_matching_jurisdiction(
        self, base_principal: PrincipalContext
    ) -> None:
        matching = UUID("00000003-0000-4000-8000-000000000001")
        assert base_principal.has_jurisdiction(matching) is True

    def test_has_jurisdiction_returns_false_for_other_jurisdiction(
        self, base_principal: PrincipalContext
    ) -> None:
        other = uuid.uuid4()
        assert base_principal.has_jurisdiction(other) is False

    def test_platform_admin_has_universal_jurisdiction(self) -> None:
        admin = PrincipalContext(
            user_id=uuid.uuid4(),
            org_id=uuid.uuid4(),
            org_name="NER Gov",
            org_kind=OrgKind.GOVERNMENT,
            role=Role.PLATFORM_ADMINISTRATOR,
            capabilities=frozenset({Capability.MANAGE_IDENTITY}),
        )
        any_jurisdiction = uuid.uuid4()
        assert admin.has_jurisdiction(any_jurisdiction) is True

    def test_has_sharing_grant_matches_owner_and_kind(self) -> None:
        owner_org = uuid.uuid4()
        principal = PrincipalContext(
            user_id=uuid.uuid4(),
            org_id=uuid.uuid4(),
            org_name="Logistics Co",
            org_kind=OrgKind.LOGISTICS,
            role=Role.FLEET_MANAGER,
            capabilities=frozenset({Capability.VIEW_FLEET}),
            sharing_grants=frozenset({
                SharingGrantContext(owner_org_id=owner_org, resource_kind=ResourceKind.REPORT),
            }),
        )
        assert principal.has_sharing_grant(owner_org, ResourceKind.REPORT) is True
        assert principal.has_sharing_grant(owner_org, ResourceKind.FLEET) is False
        assert principal.has_sharing_grant(uuid.uuid4(), ResourceKind.REPORT) is False

    def test_assignment_context_defaults(self, base_principal: PrincipalContext) -> None:
        assert base_principal.assignment.is_assigned_to_vehicle(uuid.uuid4()) is True
        assert base_principal.assignment.is_assigned_to_trip(uuid.uuid4()) is True

    def test_principal_is_frozen_immutable(self, base_principal: PrincipalContext) -> None:
        with pytest.raises(AttributeError):
            base_principal.role = Role.PLATFORM_ADMINISTRATOR  # type: ignore[misc]
