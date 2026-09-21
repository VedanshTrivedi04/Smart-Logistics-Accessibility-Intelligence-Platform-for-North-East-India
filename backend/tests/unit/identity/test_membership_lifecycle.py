"""
tests/unit/identity/test_membership_lifecycle.py — Unit tests for Membership lifecycle.

Fix 8:
- MembershipStatus states (ACTIVE, SUSPENDED, EXPIRED, REVOKED)
- Effective date interval validation
"""

from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone

import pytest

from app.modules.identity.domain.entities import Membership
from app.modules.identity.domain.enums import MembershipStatus, Role


class TestMembershipLifecycle:
    def test_active_membership_within_dates_is_effective(self) -> None:
        now = datetime.now(timezone.utc)
        m = Membership(
            id=uuid.uuid4(),
            user_id=uuid.uuid4(),
            org_id=uuid.uuid4(),
            role=Role.FIELD_OFFICER,
            status=MembershipStatus.ACTIVE,
            valid_from=now - timedelta(days=1),
            valid_until=now + timedelta(days=30),
        )
        assert m.is_effective(now) is True

    def test_suspended_membership_is_not_effective(self) -> None:
        now = datetime.now(timezone.utc)
        m = Membership(
            id=uuid.uuid4(),
            user_id=uuid.uuid4(),
            org_id=uuid.uuid4(),
            role=Role.FIELD_OFFICER,
            status=MembershipStatus.SUSPENDED,
            valid_from=now - timedelta(days=1),
        )
        assert m.is_effective(now) is False

    def test_expired_membership_is_not_effective(self) -> None:
        now = datetime.now(timezone.utc)
        m = Membership(
            id=uuid.uuid4(),
            user_id=uuid.uuid4(),
            org_id=uuid.uuid4(),
            role=Role.FIELD_OFFICER,
            status=MembershipStatus.ACTIVE,
            valid_from=now - timedelta(days=30),
            valid_until=now - timedelta(days=1),
        )
        assert m.is_effective(now) is False

    def test_future_membership_is_not_effective(self) -> None:
        now = datetime.now(timezone.utc)
        m = Membership(
            id=uuid.uuid4(),
            user_id=uuid.uuid4(),
            org_id=uuid.uuid4(),
            role=Role.FIELD_OFFICER,
            status=MembershipStatus.ACTIVE,
            valid_from=now + timedelta(days=5),
        )
        assert m.is_effective(now) is False

    def test_revoked_membership_is_not_effective(self) -> None:
        now = datetime.now(timezone.utc)
        m = Membership(
            id=uuid.uuid4(),
            user_id=uuid.uuid4(),
            org_id=uuid.uuid4(),
            role=Role.FIELD_OFFICER,
            status=MembershipStatus.REVOKED,
        )
        assert m.is_effective(now) is False
