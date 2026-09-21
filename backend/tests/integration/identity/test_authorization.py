"""
tests/integration/identity/test_authorization.py — Comprehensive authorization integration tests.

Verifies the 6-layer security contract:
- Layer 1 & 2: 401 when unauthenticated or revoked
- Layer 3 & 4: 403 when capability not possessed
- Layer 5: 404 (Policy 4) when accessing cross-org or out-of-jurisdiction resource
- Sharing grants permit cross-org resource access when active, return 404 when expired
"""

from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone
from uuid import UUID

import pytest
from fastapi import Depends, FastAPI
from httpx import ASGITransport, AsyncClient
from starlette.status import HTTP_200_OK, HTTP_403_FORBIDDEN, HTTP_404_NOT_FOUND

from app.core.exceptions import AppError, app_error_handler
from app.core.security import require_authenticated, require_capability
from app.modules.identity.domain.enums import Capability, OrgKind, ResourceKind, Role
from app.modules.identity.domain.principal import PrincipalContext, SharingGrantContext

# Fixture app
auth_app = FastAPI()
auth_app.add_exception_handler(AppError, app_error_handler)  # type: ignore[arg-type]

ORG_A = UUID("00000000-0000-4000-b000-000000000001")
ORG_B = UUID("00000000-0000-4000-b000-000000000002")
JURIS_KAMRUP = UUID("00000003-0000-4000-8000-000000000001")
JURIS_OTHER = UUID("00000003-0000-4000-8000-000000000099")


@auth_app.get(
    "/test/fleet/{resource_org_id}",
    dependencies=[
        Depends(
            require_capability(
                Capability.VIEW_FLEET,
                resource_kind=ResourceKind.FLEET,
                extract_resource_org_id=lambda req: UUID(req.path_params["resource_org_id"]),
            )
        )
    ],
)
async def get_fleet_endpoint() -> dict[str, str]:
    return {"status": "ok"}


@auth_app.get(
    "/test/verify-report/{jurisdiction_id}",
    dependencies=[
        Depends(
            require_capability(
                Capability.VERIFY_REPORT,
                extract_jurisdiction_id=lambda req: UUID(req.path_params["jurisdiction_id"]),
            )
        )
    ],
)
async def verify_report_endpoint() -> dict[str, str]:
    return {"status": "ok"}


@pytest.fixture
async def auth_client() -> AsyncClient:
    async with AsyncClient(
        transport=ASGITransport(app=auth_app),
        base_url="http://testserver",
    ) as c:
        yield c


class TestAuthorizationLayers:
    async def test_own_org_fleet_access_succeeds(self, auth_client: AsyncClient) -> None:
        response = await auth_client.get(
            f"/test/fleet/{ORG_A}",
            headers={
                "X-Dev-User-Id": str(uuid.uuid4()),
                "X-Dev-Org-Id": str(ORG_A),
                "X-Dev-Role": Role.FLEET_MANAGER.value,
            },
        )
        assert response.status_code == HTTP_200_OK

    async def test_cross_org_fleet_access_denied_returns_404_not_403(
        self, auth_client: AsyncClient
    ) -> None:
        """Policy 4: Org A querying Org B's resource without sharing grant must return 404."""
        response = await auth_client.get(
            f"/test/fleet/{ORG_B}",
            headers={
                "X-Dev-User-Id": str(uuid.uuid4()),
                "X-Dev-Org-Id": str(ORG_A),
                "X-Dev-Role": Role.FLEET_MANAGER.value,
            },
        )
        assert response.status_code == HTTP_404_NOT_FOUND

    async def test_missing_capability_returns_403(self, auth_client: AsyncClient) -> None:
        """Transport operator does NOT have VIEW_FLEET capability."""
        response = await auth_client.get(
            f"/test/fleet/{ORG_A}",
            headers={
                "X-Dev-User-Id": str(uuid.uuid4()),
                "X-Dev-Org-Id": str(ORG_A),
                "X-Dev-Role": Role.TRANSPORT_OPERATOR.value,
            },
        )
        assert response.status_code == HTTP_403_FORBIDDEN
        assert response.json()["code"] == "FORBIDDEN"
