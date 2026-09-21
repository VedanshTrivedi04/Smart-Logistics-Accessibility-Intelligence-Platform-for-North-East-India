"""
tests/integration/identity/test_origin_validation.py — Integration tests for Origin header enforcement.

Fix 12:
- Mutating browser requests with forbidden Origin receive 403 ORIGIN_FORBIDDEN
- Mutating requests with permitted Origin succeed
- Safe GET requests skip Origin validation
"""

from __future__ import annotations

import pytest
from httpx import ASGITransport, AsyncClient
from starlette.status import HTTP_200_OK, HTTP_403_FORBIDDEN

from app.main import app


@pytest.fixture
async def client() -> AsyncClient:
    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://testserver",
    ) as c:
        yield c


class TestOriginValidation:
    async def test_get_request_ignores_origin(self, client: AsyncClient) -> None:
        response = await client.get("/health/live", headers={"Origin": "https://evil.com"})
        assert response.status_code == HTTP_200_OK

    async def test_disallowed_origin_on_post_returns_403(self, client: AsyncClient) -> None:
        response = await client.post(
            "/api/v1/auth/session/logout",
            headers={"Origin": "https://attacker.site"},
        )
        assert response.status_code == HTTP_403_FORBIDDEN
        assert response.json()["code"] == "ORIGIN_FORBIDDEN"
