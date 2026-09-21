"""
tests/unit/identity/test_grant_authority.py — Unit tests for Grant Authority Rules.

Fix 4:
- Grantor cannot delegate capabilities or jurisdictions they do not possess
- XOR grantee constraint (user XOR org)
"""

from __future__ import annotations

import uuid
from unittest.mock import AsyncMock
from uuid import UUID

import pytest

from app.core.exceptions import GrantAuthorityError
from app.modules.identity.application.grant_service import CreateGrantUseCase, ValidateGrantAuthorityUseCase
from app.modules.identity.domain.enums import Capability, GrantScopeType, OrgKind, Role
from app.modules.identity.domain.principal import PrincipalContext


@pytest.fixture
def verifier_principal() -> PrincipalContext:
    return PrincipalContext(
        user_id=uuid.uuid4(),
        org_id=uuid.uuid4(),
        org_name="District Office",
        org_kind=OrgKind.GOVERNMENT,
        role=Role.DISTRICT_VERIFIER,
        capabilities=frozenset({
            Capability.VERIFY_REPORT,
            Capability.VIEW_REPORT_SUMMARY,
            Capability.VIEW_REPORT_DETAIL,
            Capability.VIEW_ROAD_STATUS,
        }),
        jurisdiction_ids=frozenset({
            UUID("00000003-0000-4000-8000-000000000001"),
        }),
    )


class TestGrantAuthority:
    def test_grantor_cannot_grant_unpossessed_capability(
        self, verifier_principal: PrincipalContext
    ) -> None:
        validator = ValidateGrantAuthorityUseCase()
        # Verifier does NOT have MANAGE_IDENTITY or DISPATCH_ROUTE
        with pytest.raises(GrantAuthorityError) as exc_info:
            validator.validate(
                grantor=verifier_principal,
                scope_type=GrantScopeType.CAPABILITY,
                capabilities=[Capability.DISPATCH_ROUTE],
                jurisdiction_ids=[],
            )
        assert "Cannot grant capability" in str(exc_info.value)

    def test_grantor_cannot_grant_unpossessed_jurisdiction(
        self, verifier_principal: PrincipalContext
    ) -> None:
        validator = ValidateGrantAuthorityUseCase()
        unowned_jurisdiction = uuid.uuid4()
        with pytest.raises(GrantAuthorityError) as exc_info:
            validator.validate(
                grantor=verifier_principal,
                scope_type=GrantScopeType.JURISDICTION,
                capabilities=[],
                jurisdiction_ids=[unowned_jurisdiction],
            )
        assert "beyond your own" in str(exc_info.value)

    async def test_xor_constraint_rejects_both_user_and_org_grantee(
        self, verifier_principal: PrincipalContext
    ) -> None:
        repo = AsyncMock()
        use_case = CreateGrantUseCase(repo)

        with pytest.raises(GrantAuthorityError) as exc_info:
            await use_case.execute(
                grantor=verifier_principal,
                scope_type=GrantScopeType.CAPABILITY,
                grantee_user_id=uuid.uuid4(),
                grantee_org_id=uuid.uuid4(),
                capabilities=[Capability.VERIFY_REPORT],
                jurisdiction_ids=[],
            )
        assert "either a grantee user OR a grantee org, not both" in str(exc_info.value)

    async def test_xor_constraint_rejects_neither_grantee(
        self, verifier_principal: PrincipalContext
    ) -> None:
        repo = AsyncMock()
        use_case = CreateGrantUseCase(repo)

        with pytest.raises(GrantAuthorityError):
            await use_case.execute(
                grantor=verifier_principal,
                scope_type=GrantScopeType.CAPABILITY,
                grantee_user_id=None,
                grantee_org_id=None,
                capabilities=[Capability.VERIFY_REPORT],
                jurisdiction_ids=[],
            )
