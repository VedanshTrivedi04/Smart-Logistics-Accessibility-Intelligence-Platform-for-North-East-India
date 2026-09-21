"""
tests/integration/identity/test_dev_mode_guards.py — Tests for Dev-Mode security guards.

Fix 13:
- DEV_JWT_MODE=true in staging or production must fail startup fast
- DevModeVerifier cannot be instantiated outside development/test mode
"""

from __future__ import annotations

import os

import pytest

from app.core.config import Settings
from app.modules.identity.infrastructure.dev_verifier import DevModeVerifier


class TestDevModeGuards:
    def test_dev_jwt_mode_in_staging_raises_value_error(self) -> None:
        with pytest.raises(ValueError) as exc_info:
            Settings(
                APP_ENV="staging",
                DEV_JWT_MODE=True,
                SESSION_SECRET="test-session-secret-at-least-32-characters-long",
                CSRF_SECRET="test-csrf-secret-at-least-32-characters-long-x",
                TOKEN_HMAC_KEY="test-token-hmac-key-at-least-32-characters-long",
                DATABASE_URL="postgresql+asyncpg://test:test@localhost/test_pooler?ssl=require",
                DATABASE_URL_DIRECT="postgresql+asyncpg://test:test@localhost/test?ssl=require",
                REDIS_URL="redis://localhost:6379/15",
                REDIS_CELERY_URL="redis://localhost:6379/14",
                OBJECT_STORAGE_ENDPOINT="http://localhost:9000",
                OBJECT_STORAGE_ACCESS_KEY="test_key",
                OBJECT_STORAGE_SECRET_KEY="test_secret",
            )
        assert "DEV_JWT_MODE=true is not allowed in staging" in str(exc_info.value)

    def test_dev_jwt_mode_in_production_raises_value_error(self) -> None:
        with pytest.raises(ValueError) as exc_info:
            Settings(
                APP_ENV="production",
                DEV_JWT_MODE=True,
                OIDC_ISSUER="https://accounts.google.com",
                SESSION_SECRET="test-session-secret-at-least-32-characters-long",
                CSRF_SECRET="test-csrf-secret-at-least-32-characters-long-x",
                TOKEN_HMAC_KEY="test-token-hmac-key-at-least-32-characters-long",
                DATABASE_URL="postgresql+asyncpg://test:test@localhost/test_pooler?ssl=require",
                DATABASE_URL_DIRECT="postgresql+asyncpg://test:test@localhost/test?ssl=require",
                REDIS_URL="redis://localhost:6379/15",
                REDIS_CELERY_URL="redis://localhost:6379/14",
                OBJECT_STORAGE_ENDPOINT="http://localhost:9000",
                OBJECT_STORAGE_ACCESS_KEY="test_key",
                OBJECT_STORAGE_SECRET_KEY="test_secret",
            )
        assert "DEV_JWT_MODE=true is not allowed in production" in str(exc_info.value)

    def test_dev_mode_verifier_instantiation_blocked_outside_dev_or_test(self) -> None:
        staging_settings = Settings(
            APP_ENV="staging",
            DEV_JWT_MODE=False,
            SESSION_SECRET="test-session-secret-at-least-32-characters-long",
            CSRF_SECRET="test-csrf-secret-at-least-32-characters-long-x",
            TOKEN_HMAC_KEY="test-token-hmac-key-at-least-32-characters-long",
            DATABASE_URL="postgresql+asyncpg://test:test@localhost/test_pooler?ssl=require",
            DATABASE_URL_DIRECT="postgresql+asyncpg://test:test@localhost/test?ssl=require",
            REDIS_URL="redis://localhost:6379/15",
            REDIS_CELERY_URL="redis://localhost:6379/14",
            OBJECT_STORAGE_ENDPOINT="http://localhost:9000",
            OBJECT_STORAGE_ACCESS_KEY="test_key",
            OBJECT_STORAGE_SECRET_KEY="test_secret",
        )
        with pytest.raises(RuntimeError) as exc_info:
            DevModeVerifier(staging_settings)
        assert "cannot be instantiated outside development/test mode" in str(exc_info.value)

    def test_dev_mode_verifier_allowed_in_development_with_flag(self) -> None:
        dev_settings = Settings(
            APP_ENV="development",
            DEV_JWT_MODE=True,
            SESSION_SECRET="test-session-secret-at-least-32-characters-long",
            CSRF_SECRET="test-csrf-secret-at-least-32-characters-long-x",
            TOKEN_HMAC_KEY="test-token-hmac-key-at-least-32-characters-long",
            DATABASE_URL="postgresql+asyncpg://test:test@localhost/test_pooler?ssl=require",
            DATABASE_URL_DIRECT="postgresql+asyncpg://test:test@localhost/test?ssl=require",
            REDIS_URL="redis://localhost:6379/15",
            REDIS_CELERY_URL="redis://localhost:6379/14",
            OBJECT_STORAGE_ENDPOINT="http://localhost:9000",
            OBJECT_STORAGE_ACCESS_KEY="test_key",
            OBJECT_STORAGE_SECRET_KEY="test_secret",
        )
        verifier = DevModeVerifier(dev_settings)
        assert verifier is not None
