"""
tests/conftest.py — Shared pytest fixtures for all test suites.

Fixtures provided:
- settings: Test-specific settings with DEV_JWT_MODE=True
- async_client: httpx AsyncClient for integration tests
- Phase 2+: db_session, authenticated_client fixtures added later
"""

from __future__ import annotations

import os
import pytest

# Set test environment variables BEFORE any app imports
os.environ.setdefault("APP_ENV", "development")
os.environ.setdefault("DEV_JWT_MODE", "true")
os.environ.setdefault("DEMO_MODE", "true")
os.environ.setdefault("LOG_LEVEL", "ERROR")  # Suppress logs in tests
os.environ.setdefault("USE_NULL_POOL", "true")  # Prevent asyncpg event loop issues in pytest

# Load database connection from .env if present (e.g., live Neon database)
from pathlib import Path
from dotenv import dotenv_values

_env_path = Path(__file__).resolve().parent.parent / ".env"
_env_vars = dotenv_values(_env_path) if _env_path.exists() else {}

# Required secrets (test-safe dummy values)
os.environ.setdefault("SESSION_SECRET", "test-session-secret-at-least-32-characters-long")
os.environ.setdefault("CSRF_SECRET", "test-csrf-secret-at-least-32-characters-long-x")
os.environ.setdefault("TOKEN_HMAC_KEY", "test-token-hmac-key-at-least-32-characters-long")

if "DATABASE_URL" in _env_vars:
    os.environ.setdefault("DATABASE_URL", _env_vars["DATABASE_URL"])
else:
    os.environ.setdefault("DATABASE_URL", "postgresql+asyncpg://test:test@localhost/test_pooler?ssl=require")

if "DATABASE_URL_DIRECT" in _env_vars:
    os.environ.setdefault("DATABASE_URL_DIRECT", _env_vars["DATABASE_URL_DIRECT"])
else:
    os.environ.setdefault("DATABASE_URL_DIRECT", "postgresql+asyncpg://test:test@localhost/test?ssl=require")
os.environ.setdefault("REDIS_URL", "redis://localhost:6379/15")
os.environ.setdefault("REDIS_CELERY_URL", "redis://localhost:6379/14")
os.environ.setdefault("OBJECT_STORAGE_ENDPOINT", "http://localhost:9000")
os.environ.setdefault("OBJECT_STORAGE_ACCESS_KEY", "test_key")
os.environ.setdefault("OBJECT_STORAGE_SECRET_KEY", "test_secret")


from app.core.config import get_settings  # noqa: E402

# Ensure all SQLAlchemy models are registered in Base.metadata for foreign key resolution
import app.modules.identity.infrastructure.models  # noqa: F401, E402
import app.modules.network.infrastructure.models   # noqa: F401, E402
import app.modules.reporting.infrastructure.models # noqa: F401, E402
import app.modules.incidents.infrastructure.models # noqa: F401, E402
import app.modules.logistics.infrastructure.models # noqa: F401, E402
import app.modules.telemetry.infrastructure.models # noqa: F401, E402
import app.modules.routing.infrastructure.models   # noqa: F401, E402
import app.modules.impact.infrastructure.models    # noqa: F401, E402


@pytest.fixture(autouse=True)
def clear_settings_cache() -> None:
    """Clear the settings LRU cache before each test to ensure env vars are re-read."""
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()
