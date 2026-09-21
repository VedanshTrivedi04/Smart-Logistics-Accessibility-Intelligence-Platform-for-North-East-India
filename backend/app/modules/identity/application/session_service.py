"""
app/modules/identity/application/session_service.py — Session & CSRF token lifecycle management.

Covers:
- Session creation with HMAC-SHA256 digests
- Initial CSRF token generation
- Single session revocation (logout)
- All user sessions revocation (logout-all)
- Admin revocation with capability check
"""

from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone
from uuid import UUID

from app.core.config import get_settings
from app.core.exceptions import ForbiddenError
from app.modules.identity.application.ports import IdentityRepositoryPort
from app.modules.identity.domain.audit_events import IdentityAuditEvent
from app.modules.identity.domain.entities import CSRFToken, Session
from app.modules.identity.domain.enums import Capability, Role
from app.modules.identity.domain.principal import PrincipalContext
from app.modules.identity.infrastructure.token_hasher import compute_token_digest, generate_raw_token


class CreateSessionUseCase:
    def __init__(self, repo: IdentityRepositoryPort) -> None:
        self.repo = repo

    async def execute(
        self,
        user_id: UUID,
        org_id: UUID,
        role: Role,
        ip_address: str | None = None,
        user_agent: str | None = None,
    ) -> tuple[Session, str, str]:
        """
        Creates a server-side session and an initial session-bound CSRF token.
        Returns (session, raw_session_token, raw_csrf_token).
        """
        settings = get_settings()
        now = datetime.now(timezone.utc)
        expires_at = now + timedelta(hours=settings.SESSION_ABSOLUTE_LIFETIME_HOURS)

        # 1. Generate session token
        raw_session_token = generate_raw_token(32)
        session_digest = compute_token_digest(raw_session_token, settings.TOKEN_HMAC_KEY)

        session = Session(
            id=uuid.uuid4(),
            user_id=user_id,
            org_id=org_id,
            role=role,
            token_digest=session_digest,
            ip_address=ip_address,
            user_agent=user_agent,
            created_at=now,
            last_seen_at=now,
            expires_at=expires_at,
        )
        saved_session = await self.repo.create_session(session)

        # 2. Generate initial CSRF token for this session
        raw_csrf_token = generate_raw_token(32)
        csrf_digest = compute_token_digest(raw_csrf_token, settings.TOKEN_HMAC_KEY)

        csrf_token = CSRFToken(
            id=uuid.uuid4(),
            session_id=saved_session.id,
            token_digest=csrf_digest,
            created_at=now,
            expires_at=expires_at,
        )
        await self.repo.create_csrf_token(csrf_token)

        # 3. Emit audit event
        await self.repo.emit_audit_event(
            event=IdentityAuditEvent.SESSION_CREATED,
            actor_id=user_id,
            resource_id=saved_session.id,
            payload={
                "org_id": str(org_id),
                "role": role.value,
                "ip_address": ip_address,
            },
        )

        return saved_session, raw_session_token, raw_csrf_token


class RevokeCurrentSessionUseCase:
    def __init__(self, repo: IdentityRepositoryPort) -> None:
        self.repo = repo

    async def execute(self, session_id: UUID, user_id: UUID, reason: str = "user_logout") -> None:
        await self.repo.revoke_session(session_id, reason=reason)
        await self.repo.delete_csrf_tokens_for_session(session_id)
        await self.repo.emit_audit_event(
            event=IdentityAuditEvent.SESSION_REVOKED,
            actor_id=user_id,
            resource_id=session_id,
            payload={"reason": reason},
        )


class RevokeAllUserSessionsUseCase:
    def __init__(self, repo: IdentityRepositoryPort) -> None:
        self.repo = repo

    async def execute(self, user_id: UUID, reason: str = "user_logout_all") -> int:
        count = await self.repo.revoke_all_user_sessions(user_id, reason=reason)
        await self.repo.emit_audit_event(
            event=IdentityAuditEvent.SESSION_REVOKED_ALL,
            actor_id=user_id,
            resource_id=user_id,
            payload={"reason": reason, "revoked_count": count},
        )
        return count


class AdminRevokeSessionUseCase:
    def __init__(self, repo: IdentityRepositoryPort) -> None:
        self.repo = repo

    async def execute(
        self,
        admin_principal: PrincipalContext,
        target_session_id: UUID,
        reason: str,
    ) -> None:
        if not admin_principal.can(Capability.MANAGE_IDENTITY):
            raise ForbiddenError("Admin privilege MANAGE_IDENTITY required to revoke arbitrary sessions")

        await self.repo.revoke_session(target_session_id, reason=f"admin_revocation: {reason}")
        await self.repo.delete_csrf_tokens_for_session(target_session_id)
        await self.repo.emit_audit_event(
            event=IdentityAuditEvent.SESSION_REVOKED,
            actor_id=admin_principal.user_id,
            resource_id=target_session_id,
            payload={"admin_id": str(admin_principal.user_id), "reason": reason},
        )
