"""
tests/integration/identity/test_me_endpoint.py — Integration tests for GET /api/v1/me.

Verifies:
- All 11 roles return correct capabilities from GET /me
- Unauthenticated requests are rejected with 401 AUTHENTICATION_REQUIRED
- PrincipalContext serialization matches MeResponse schema
"""

from __future__ import annotations

import uuid

import pytest
from httpx import ASGITransport, AsyncClient
from starlette.status import HTTP_200_OK, HTTP_401_UNAUTHORIZED

from app.main import app
from app.modules.identity.domain.enums import Capability, Role
from app.modules.identity.domain.role_capabilities import get_role_baseline_capabilities


@pytest.fixture
async def client() -> AsyncClient:
    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://testserver",
    ) as c:
        yield c


class TestMeEndpoint:
    async def test_unauthenticated_request_returns_401(self, client: AsyncClient) -> None:
        # Override default dev headers to test unauthenticated
        response = await client.get("/api/v1/me", headers={"X-Dev-User-Id": ""})
        assert response.status_code == HTTP_401_UNAUTHORIZED
        body = response.json()
        assert body["code"] in ("AUTHENTICATION_REQUIRED", "AUTHENTICATION_REQUIRED")

    @pytest.mark.parametrize("role", list(Role))
    async def test_all_11_roles_return_correct_capabilities_via_me(
        self, client: AsyncClient, role: Role
    ) -> None:
        user_id = str(uuid.uuid4())
        org_id = str(uuid.uuid4())

        response = await client.get(
            "/api/v1/me",
            headers={
                "X-Dev-User-Id": user_id,
                "X-Dev-Org-Id": org_id,
                "X-Dev-Role": role.value,
            },
        )
        assert response.status_code == HTTP_200_OK
        data = response.json()
        assert data["user_id"] == user_id
        assert data["org_id"] == org_id
        assert data["role"] == role.value

        # Compare capabilities against baseline
        expected_caps = {c.value for c in get_role_baseline_capabilities(role)}
        returned_caps = set(data["capabilities"])
        assert returned_caps == expected_caps

    async def test_local_authority_lacks_verify_report_in_me(self, client: AsyncClient) -> None:
        response = await client.get(
            "/api/v1/me",
            headers={
                "X-Dev-User-Id": str(uuid.uuid4()),
                "X-Dev-Role": Role.LOCAL_AUTHORITY.value,
            },
        )
        assert response.status_code == HTTP_200_OK
        caps = set(response.json()["capabilities"])
        assert Capability.VERIFY_REPORT.value not in caps
        assert Capability.SUBMIT_REPORT.value in caps

    async def test_platform_admin_lacks_view_report_media_in_me(self, client: AsyncClient) -> None:
        response = await client.get(
            "/api/v1/me",
            headers={
                "X-Dev-User-Id": str(uuid.uuid4()),
                "X-Dev-Role": Role.PLATFORM_ADMINISTRATOR.value,
            },
        )
        assert response.status_code == HTTP_200_OK
        caps = set(response.json()["capabilities"])
        assert Capability.VIEW_REPORT_MEDIA.value not in caps
        assert Capability.MANAGE_IDENTITY.value in caps
