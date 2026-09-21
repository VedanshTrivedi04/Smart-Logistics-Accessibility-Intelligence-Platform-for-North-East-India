"""
tests/integration/identity/test_multi_org.py — Integration tests for Multi-Organization Selection.

Fix 7:
- Selection token signing and verification (5 min expiry)
- Token tampering prevention
- SelectOrgUseCase session creation
"""

from __future__ import annotations

import time
import uuid
from unittest.mock import AsyncMock
from uuid import UUID

import pytest

from app.core.config import get_settings
from app.core.exceptions import AuthenticationError
from app.modules.identity.application.org_selection_service import (
    SelectOrgUseCase,
    create_selection_token,
    verify_selection_token,
)
from app.modules.identity.domain.entities import Membership, Session
from app.modules.identity.domain.enums import MembershipStatus, Role

settings = get_settings()
HMAC_KEY = settings.TOKEN_HMAC_KEY


class TestMultiOrgSelection:
    def test_selection_token_round_trip(self) -> None:
        user_id = uuid.uuid4()
        token = create_selection_token(user_id, HMAC_KEY, expires_in_seconds=300)
        verified_user_id = verify_selection_token(token, HMAC_KEY)
        assert verified_user_id == user_id

    def test_tampered_selection_token_rejected(self) -> None:
        user_id = uuid.uuid4()
        token = create_selection_token(user_id, HMAC_KEY, expires_in_seconds=300)
        tampered = token[:-4] + "xxxx"
        with pytest.raises(AuthenticationError) as exc_info:
            verify_selection_token(tampered, HMAC_KEY)
        assert "signature" in str(exc_info.value).lower() or "format" in str(exc_info.value).lower()

    def test_expired_selection_token_rejected(self) -> None:
        user_id = uuid.uuid4()
        token = create_selection_token(user_id, HMAC_KEY, expires_in_seconds=-1)
        with pytest.raises(AuthenticationError) as exc_info:
            verify_selection_token(token, HMAC_KEY)
        assert "expired" in str(exc_info.value).lower()

    async def test_select_org_use_case_creates_session(self) -> None:
        user_id = uuid.uuid4()
        org_id = uuid.uuid4()
        token = create_selection_token(user_id, HMAC_KEY, expires_in_seconds=300)

        repo = AsyncMock()
        repo.get_membership.return_value = Membership(
            id=uuid.uuid4(),
            user_id=user_id,
            org_id=org_id,
            role=Role.DISTRICT_VERIFIER,
            status=MembershipStatus.ACTIVE,
        )

        session_creator = AsyncMock()
        fake_session = Session(
            id=uuid.uuid4(),
            user_id=user_id,
            org_id=org_id,
            role=Role.DISTRICT_VERIFIER,
            token_digest="a" * 64,
            ip_address=None,
            user_agent=None,
            created_at=None,
            last_seen_at=None,
            expires_at=None,
        )
        session_creator.execute.return_value = (fake_session, "raw-session-token", "raw-csrf-token")

        use_case = SelectOrgUseCase(repo, session_creator)
        session, raw_session, raw_csrf = await use_case.execute(token, org_id)

        assert session.user_id == user_id
        assert session.org_id == org_id
        assert raw_session == "raw-session-token"
        assert raw_csrf == "raw-csrf-token"
        repo.emit_audit_event.assert_called_once()
