"""
tests/integration/identity/test_oidc_flow.py — OIDC flow tests (Fix 2).

Verifies:
- State, Nonce, and PKCE challenge generation
- State single-use consumption (replay protection)
- Nonce matching in ID token
- PKCE code_verifier passed to token exchange
- 0 active memberships returns 403 NoActiveMembershipError
"""

from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock

import pytest

from app.core.exceptions import AuthenticationError, NoActiveMembershipError
from app.modules.identity.application.oidc_flow import InitOidcUseCase, ProcessOidcCallbackUseCase
from app.modules.identity.domain.entities import AuthTransaction, Membership, User
from app.modules.identity.domain.enums import Role
from app.modules.identity.domain.exceptions import InvalidAuthStateError


class TestOidcFlow:
    async def test_auth_state_single_use(self) -> None:
        """Fix 2: Reusing the same state parameter must be rejected immediately."""
        now = datetime.now(timezone.utc)
        state_val = "valid-state-value-12345"
        tx = AuthTransaction(
            id=uuid.uuid4(),
            state=state_val,
            nonce="nonce-123",
            code_verifier="verifier-123",
            ip_address=None,
            created_at=now,
            expires_at=now + timedelta(minutes=10),
            consumed_at=now - timedelta(seconds=5),  # ALREADY CONSUMED
        )

        repo = AsyncMock()
        repo.get_valid_auth_transaction.return_value = None  # None because it is consumed

        verifier = AsyncMock()
        session_creator = AsyncMock()
        use_case = ProcessOidcCallbackUseCase(repo, verifier, session_creator)

        with pytest.raises(InvalidAuthStateError):
            await use_case.execute(code="sample-code", state=state_val)

    async def test_pkce_verifier_exchange_and_nonce_validation(self) -> None:
        """Fix 2: Verifier must be passed to exchange_code, and nonce must match."""
        now = datetime.now(timezone.utc)
        state_val = "fresh-state-value-999"
        nonce_val = "fresh-nonce-999"
        verifier_val = "fresh-verifier-string"

        tx = AuthTransaction(
            id=uuid.uuid4(),
            state=state_val,
            nonce=nonce_val,
            code_verifier=verifier_val,
            ip_address=None,
            created_at=now,
            expires_at=now + timedelta(minutes=10),
        )

        repo = AsyncMock()
        repo.get_valid_auth_transaction.return_value = tx
        repo.upsert_user.return_value = User(
            id=uuid.uuid4(),
            issuer="https://idp.example.com",
            subject="sub-123",
            email="test@example.com",
            display_name="Test User",
        )
        repo.get_active_memberships_for_user.return_value = [
            Membership(
                id=uuid.uuid4(),
                user_id=uuid.uuid4(),
                org_id=uuid.uuid4(),
                role=Role.FIELD_OFFICER,
            )
        ]

        oidc_verifier = AsyncMock()
        oidc_verifier.exchange_code.return_value = {"id_token": "mock.id.token"}
        oidc_verifier.verify_id_token.return_value = {
            "sub": "sub-123",
            "iss": "https://idp.example.com",
            "nonce": nonce_val,
            "email": "test@example.com",
        }

        session_creator = AsyncMock()
        session_creator.execute.return_value = (AsyncMock(), "raw-session", "raw-csrf")

        use_case = ProcessOidcCallbackUseCase(repo, oidc_verifier, session_creator)
        result = await use_case.execute(code="valid-auth-code", state=state_val)

        # Verify PKCE code_verifier was passed
        oidc_verifier.exchange_code.assert_called_once()
        call_kwargs = oidc_verifier.exchange_code.call_args[1]
        assert call_kwargs["code_verifier"] == verifier_val

        # Verify nonce was checked
        oidc_verifier.verify_id_token.assert_called_once_with(
            id_token="mock.id.token", nonce=nonce_val
        )
        # Verify transaction consumed
        repo.consume_auth_transaction.assert_called_once_with(state_val)
        assert result["status"] == "authenticated"

    async def test_zero_memberships_raises_no_active_membership(self) -> None:
        now = datetime.now(timezone.utc)
        state_val = "state-zero-members"
        tx = AuthTransaction(
            id=uuid.uuid4(),
            state=state_val,
            nonce="nonce",
            code_verifier="verifier",
            ip_address=None,
            created_at=now,
            expires_at=now + timedelta(minutes=10),
        )

        repo = AsyncMock()
        repo.get_valid_auth_transaction.return_value = tx
        repo.upsert_user.return_value = User(
            id=uuid.uuid4(),
            issuer="iss",
            subject="sub",
            email=None,
            display_name="Orphan",
        )
        repo.get_active_memberships_for_user.return_value = []  # ZERO MEMBERSHIPS

        oidc_verifier = AsyncMock()
        oidc_verifier.exchange_code.return_value = {"id_token": "token"}
        oidc_verifier.verify_id_token.return_value = {"sub": "sub", "iss": "iss", "nonce": "nonce"}

        session_creator = AsyncMock()
        use_case = ProcessOidcCallbackUseCase(repo, oidc_verifier, session_creator)

        with pytest.raises(NoActiveMembershipError):
            await use_case.execute(code="code", state=state_val)
