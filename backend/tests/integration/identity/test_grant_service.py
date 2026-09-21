"""
tests/integration/identity/test_grant_service.py — Integration tests for Grant Service.

Fix 4:
- Grant creation and revocation workflows
- Permission checks for grant creation and revocation
- Sharing grant management
"""

from __future__ import annotations

import uuid
from unittest.mock import AsyncMock
from uuid import UUID

import pytest

from app.core.exceptions import ForbiddenError, GrantAuthorityError
from app.modules.identity.application.grant_service import (
    CreateGrantUseCase,
    CreateSharingGrantUseCase,
    RevokeGrantUseCase,
)
from app.modules.identity.domain.entities import Grant
from app.modules.identity.domain.enums import Capability, GrantScopeType, OrgKind, ResourceKind, Role
from app.modules.identity.domain.principal import PrincipalContext


@pytest.fixture
def admin_principal() -> PrincipalContext:
    return PrincipalContext(
        user_id=uuid.uuid4(),
        org_id=uuid.uuid4(),
        org_name="NER Gov",
        org_kind=OrgKind.GOVERNMENT,
        role=Role.PLATFORM_ADMINISTRATOR,
        capabilities=frozenset({Capability.MANAGE_GRANTS, Capability.MANAGE_IDENTITY}),
    )


@pytest.fixture
def driver_principal() -> PrincipalContext:
    return PrincipalContext(
        user_id=uuid.uuid4(),
        org_id=uuid.uuid4(),
        org_name="Logistics Co",
        org_kind=OrgKind.LOGISTICS,
        role=Role.TRANSPORT_OPERATOR,
        capabilities=frozenset({Capability.SUBMIT_GPS}),
    )


class TestGrantService:
    async def test_create_capability_grant_by_admin(self, admin_principal: PrincipalContext) -> None:
        repo = AsyncMock()
        repo.create_grant.side_effect = lambda g: g

        use_case = CreateGrantUseCase(repo)
        target_user = uuid.uuid4()

        grant = await use_case.execute(
            grantor=admin_principal,
            scope_type=GrantScopeType.CAPABILITY,
            grantee_user_id=target_user,
            grantee_org_id=None,
            capabilities=[Capability.MANAGE_IDENTITY],
            jurisdiction_ids=[],
        )
        assert grant.grantee_user_id == target_user
        assert Capability.MANAGE_IDENTITY in grant.capabilities
        repo.create_grant.assert_called_once()
        repo.emit_audit_event.assert_called_once()

    async def test_revoke_grant_unauthorized_user_forbidden(
        self, driver_principal: PrincipalContext
    ) -> None:
        repo = AsyncMock()
        grant_id = uuid.uuid4()
        other_user = uuid.uuid4()
        repo.get_grant_by_id.return_value = Grant(
            id=grant_id,
            grantor_user_id=other_user,
            grantor_org_id=uuid.uuid4(),
            scope_type=GrantScopeType.CAPABILITY,
        )

        use_case = RevokeGrantUseCase(repo)
        with pytest.raises(ForbiddenError):
            await use_case.execute(
                principal=driver_principal,
                grant_id=grant_id,
                reason="malicious_revocation",
            )

    async def test_driver_cannot_create_sharing_grant(
        self, driver_principal: PrincipalContext
    ) -> None:
        repo = AsyncMock()
        use_case = CreateSharingGrantUseCase(repo)

        with pytest.raises(ForbiddenError):
            await use_case.execute(
                principal=driver_principal,
                recipient_org_id=uuid.uuid4(),
                resource_kind=ResourceKind.FLEET,
            )
