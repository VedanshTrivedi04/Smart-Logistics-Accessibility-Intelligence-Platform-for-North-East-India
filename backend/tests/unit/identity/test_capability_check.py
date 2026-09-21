"""
tests/unit/identity/test_capability_check.py — Unit tests for CheckCapabilityUseCase.

Fix 5 & Policy 4:
- Cross-org access without sharing grant raises 404 (NotFoundError), NEVER 403
- Missing capability raises 403 (ForbiddenError)
- Jurisdiction mismatch raises 404 (NotFoundError)
"""

from __future__ import annotations

import uuid
from uuid import UUID

import pytest

from app.core.exceptions import ForbiddenError, NotFoundError
from app.modules.identity.application.check_capability import (
    CapabilityCheckRequest,
    CheckCapabilityUseCase,
    enforce_capability,
)
from app.modules.identity.domain.assignment_context import AssignmentContext
from app.modules.identity.domain.enums import Capability, OrgKind, ResourceKind, Role
from app.modules.identity.domain.principal import PrincipalContext, SharingGrantContext


@pytest.fixture
def org_a_id() -> UUID:
    return uuid.uuid4()


@pytest.fixture
def org_b_id() -> UUID:
    return uuid.uuid4()


@pytest.fixture
def principal_org_a(org_a_id: UUID, org_b_id: UUID) -> PrincipalContext:
    return PrincipalContext(
        user_id=uuid.uuid4(),
        org_id=org_a_id,
        org_name="Org A",
        org_kind=OrgKind.LOGISTICS,
        role=Role.FLEET_MANAGER,
        capabilities=frozenset({
            Capability.VIEW_FLEET,
            Capability.COMPUTE_ROUTE,
            Capability.VIEW_REPORT_SUMMARY,
        }),
        jurisdiction_ids=frozenset({
            UUID("00000003-0000-4000-8000-000000000001"),
        }),
        sharing_grants=frozenset({
            SharingGrantContext(owner_org_id=org_b_id, resource_kind=ResourceKind.REPORT),
        }),
    )


class TestCapabilityCheck:
    def test_own_org_access_allowed(
        self, principal_org_a: PrincipalContext, org_a_id: UUID
    ) -> None:
        checker = CheckCapabilityUseCase()
        req = CapabilityCheckRequest(
            principal=principal_org_a,
            required_capability=Capability.VIEW_FLEET,
            resource_org_id=org_a_id,
            resource_kind=ResourceKind.FLEET,
        )
        allowed, reason = checker.execute(req)
        assert allowed is True
        assert reason == "allowed"

    def test_cross_org_access_denied_without_sharing_grant(
        self, principal_org_a: PrincipalContext, org_b_id: UUID
    ) -> None:
        checker = CheckCapabilityUseCase()
        # Org B's FLEET resource — Org A only has sharing grant for REPORT, not FLEET
        req = CapabilityCheckRequest(
            principal=principal_org_a,
            required_capability=Capability.VIEW_FLEET,
            resource_org_id=org_b_id,
            resource_kind=ResourceKind.FLEET,
        )
        allowed, reason = checker.execute(req)
        assert allowed is False
        assert reason == "no_sharing_grant_for_cross_org_resource"

    def test_cross_org_denial_raises_not_found_policy_4(
        self, principal_org_a: PrincipalContext, org_b_id: UUID
    ) -> None:
        """Policy 4: Cross-org resource denial must return 404, never 403, to hide existence."""
        req = CapabilityCheckRequest(
            principal=principal_org_a,
            required_capability=Capability.VIEW_FLEET,
            resource_org_id=org_b_id,
            resource_kind=ResourceKind.FLEET,
        )
        with pytest.raises(NotFoundError):
            enforce_capability(req)

    def test_cross_org_access_allowed_with_sharing_grant(
        self, principal_org_a: PrincipalContext, org_b_id: UUID
    ) -> None:
        checker = CheckCapabilityUseCase()
        # Org B's REPORT resource — Org A HAS a sharing grant for REPORT
        req = CapabilityCheckRequest(
            principal=principal_org_a,
            required_capability=Capability.VIEW_REPORT_SUMMARY,
            resource_org_id=org_b_id,
            resource_kind=ResourceKind.REPORT,
        )
        allowed, reason = checker.execute(req)
        assert allowed is True
        assert reason == "allowed"

    def test_missing_capability_denied_and_raises_forbidden(
        self, principal_org_a: PrincipalContext, org_a_id: UUID
    ) -> None:
        req = CapabilityCheckRequest(
            principal=principal_org_a,
            required_capability=Capability.MANAGE_IDENTITY,
            resource_org_id=org_a_id,
            resource_kind=ResourceKind.IDENTITY,
        )
        with pytest.raises(ForbiddenError):
            enforce_capability(req)

    def test_jurisdiction_mismatch_raises_not_found(
        self, principal_org_a: PrincipalContext
    ) -> None:
        other_jurisdiction = uuid.uuid4()
        req = CapabilityCheckRequest(
            principal=principal_org_a,
            required_capability=Capability.VIEW_REPORT_SUMMARY,
            jurisdiction_id=other_jurisdiction,
        )
        with pytest.raises(NotFoundError):
            enforce_capability(req)
