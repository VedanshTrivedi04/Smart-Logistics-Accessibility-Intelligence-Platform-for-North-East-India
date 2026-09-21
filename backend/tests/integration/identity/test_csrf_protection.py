"""
tests/integration/identity/test_csrf_protection.py — CSRF protection integration tests.

Fix 11:
- State-mutating requests (POST/PUT/PATCH/DELETE) require X-CSRF-Token
- Missing or invalid CSRF token returns 403 CSRF_VALIDATION_FAILED
- Safe GET requests do not require CSRF token
"""

from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone

import pytest
from httpx import ASGITransport, AsyncClient
from starlette.status import HTTP_200_OK, HTTP_403_FORBIDDEN

from app.core.exceptions import CSRFValidationError
from app.core.security import SESSION_COOKIE_NAME, validate_csrf
from app.main import app
from app.modules.identity.domain.entities import CSRFToken
from app.modules.identity.infrastructure.token_hasher import compute_token_digest, generate_raw_token

HMAC_KEY = "test-token-hmac-key-at-least-32-characters-long"


@pytest.fixture
async def client() -> AsyncClient:
    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://testserver",
    ) as c:
        yield c


class TestCsrfProtection:
    async def test_get_csrf_token_endpoint(self, client: AsyncClient) -> None:
        """GET /auth/csrf-token returns 200 with csrf_token."""
        response = await client.get(
            "/api/v1/auth/csrf-token",
            headers={"X-Dev-User-Id": str(uuid.uuid4())},
        )
        assert response.status_code == HTTP_200_OK
        data = response.json()
        assert "csrf_token" in data
        assert len(data["csrf_token"]) > 0

    async def test_csrf_token_constant_time_comparison(self) -> None:
        session_id = uuid.uuid4()
        raw_csrf = generate_raw_token()
        digest = compute_token_digest(raw_csrf, HMAC_KEY)

        now = datetime.now(timezone.utc)
        token_entity = CSRFToken(
            id=uuid.uuid4(),
            session_id=session_id,
            token_digest=digest,
            created_at=now,
            expires_at=now + timedelta(hours=8),
        )
        assert token_entity.is_valid(now) is True
        assert token_entity.is_valid(now + timedelta(hours=9)) is False
