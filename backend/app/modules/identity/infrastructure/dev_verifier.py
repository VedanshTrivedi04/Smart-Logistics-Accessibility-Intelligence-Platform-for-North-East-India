"""
app/modules/identity/infrastructure/dev_verifier.py — Dev-Mode Auth Verifier.

Fix 13: Strict multi-layer safety guards.
Instantiating this class in any environment other than development or test
will immediately raise a RuntimeError to prevent accidental dev bypasses in staging/prod.
"""

from __future__ import annotations

from uuid import UUID

from app.core.config import Settings, get_settings
from app.core.logging import get_logger
from app.modules.identity.domain.enums import Role

logger = get_logger(__name__)


class DevModeVerifier:
    """
    NEVER instantiated unless:
      - DEV_JWT_MODE = True
      - APP_ENV in {"development", "test"}  (both required)
    """

    def __init__(self, settings: Settings | None = None) -> None:
        self.settings = settings or get_settings()
        if not (self.settings.DEV_JWT_MODE and self.settings.APP_ENV in ("development", "test")):
            raise RuntimeError(
                "DevModeVerifier cannot be instantiated outside development/test mode. "
                f"Current APP_ENV={self.settings.APP_ENV}, DEV_JWT_MODE={self.settings.DEV_JWT_MODE}"
            )
        logger.warning(
            "DEV_JWT_MODE_ACTIVE",
            message="⚠️ DevModeVerifier active. Never enable DEV_JWT_MODE in production or staging.",
            app_env=self.settings.APP_ENV,
        )

    def validate_dev_credentials(self, user_id: str, org_id: str, role: str) -> tuple[UUID, UUID, Role]:
        """Validate format and parse into domain types."""
        return UUID(user_id), UUID(org_id), Role(role)
