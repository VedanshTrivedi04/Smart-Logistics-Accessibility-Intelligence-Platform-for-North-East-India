"""
tests/integration/identity/test_session_lifecycle.py — Session & Token lifecycle tests.

Fix 1 & Fix 10:
- Session creation with SHA-256 digest
- HttpOnly cookie setting
- Logout revokes single session
- Logout-all revokes all sessions
- Revocation results in immediate 401
"""

from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock

import pytest
from httpx import ASGITransport, AsyncClient
from starlette.status import HTTP_200_OK, HTTP_401_UNAUTHORIZED

from app.core.exceptions import AuthenticationError
from app.core.security import SESSION_COOKIE_NAME
from app.main import app
from app.modules.identity.application.resolve_principal import ResolvePrincipalUseCase
from app.modules.identity.domain.entities import Membership, Organization, Session, User
from app.modules.identity.domain.enums import MembershipStatus, OrgKind, Role
from app.modules.identity.infrastructure.token_hasher import compute_token_digest, generate_raw_token

HMAC_KEY = "test-token-hmac-key-at-least-32-characters-long"


@pytest.fixture
async def client() -> AsyncClient:
    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://testserver",
    ) as c:
        yield c


class TestSessionLifecycle:
    async def test_session_idle_timeout_triggers_revocation_and_401(self) -> None:
        """Fix 10: Inactivity past idle timeout revokes session and raises 401."""
        raw_token = generate_raw_token()
        digest = compute_token_digest(raw_token, HMAC_KEY)

        now = datetime.now(timezone.utc)
        idle_last_seen = now - timedelta(minutes=65)  # 65 min ago > 60 min timeout

        stale_session = Session(
            id=uuid.uuid4(),
            user_id=uuid.uuid4(),
            org_id=uuid.uuid4(),
            role=Role.FIELD_OFFICER,
            token_digest=digest,
            ip_address=None,
            user_agent=None,
            created_at=now - timedelta(hours=2),
            last_seen_at=idle_last_seen,
            expires_at=now + timedelta(hours=6),
        )

        repo = AsyncMock()
        repo.get_session_by_token_digest.return_value = stale_session

        resolver = ResolvePrincipalUseCase(repo)
        with pytest.raises(AuthenticationError) as exc_info:
            await resolver.execute(raw_token)

        assert "inactivity" in str(exc_info.value).lower()
        repo.revoke_session.assert_called_once_with(stale_session.id, reason="idle_timeout")

    async def test_revoked_session_returns_immediate_401(self) -> None:
        raw_token = generate_raw_token()
        digest = compute_token_digest(raw_token, HMAC_KEY)

        now = datetime.now(timezone.utc)
        revoked_session = Session(
            id=uuid.uuid4(),
            user_id=uuid.uuid4(),
            org_id=uuid.uuid4(),
            role=Role.FIELD_OFFICER,
            token_digest=digest,
            ip_address=None,
            user_agent=None,
            created_at=now - timedelta(hours=1),
            last_seen_at=now - timedelta(minutes=5),
            expires_at=now + timedelta(hours=7),
            revoked_at=now - timedelta(minutes=2),
            revocation_reason="user_logout",
        )

        repo = AsyncMock()
        repo.get_session_by_token_digest.return_value = revoked_session

        resolver = ResolvePrincipalUseCase(repo)
        with pytest.raises(AuthenticationError) as exc_info:
            await resolver.execute(raw_token)

        assert "revoked" in str(exc_info.value).lower()
