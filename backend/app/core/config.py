"""
app/core/config.py — Application configuration via Pydantic Settings.

Loads all config from environment variables (.env file in dev).
Fails fast on startup if any required variable is missing.
No secrets have default values.
"""

from __future__ import annotations

from functools import lru_cache
from typing import Any, Literal

from pydantic import Field, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """
    Central application settings.

    All values are loaded from environment variables.
    In development, these are read from a .env file.
    In production, they must be set as real environment variables.
    """

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",  # Ignore unknown env vars
    )

    # ────────────────────────────────────────────────────
    # App environment
    # ────────────────────────────────────────────────────
    APP_ENV: Literal["development", "staging", "production"] = "development"
    DEMO_MODE: bool = False
    LOG_LEVEL: Literal["DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"] = "INFO"
    APP_HOST: str = "0.0.0.0"
    APP_PORT: int = 8000

    # ────────────────────────────────────────────────────
    # Neon PostgreSQL — TWO connection strings
    # DATABASE_URL        = pooled (PgBouncer) → FastAPI/SQLAlchemy runtime
    # DATABASE_URL_DIRECT = direct (non-pooled) → Alembic migrations ONLY
    # ────────────────────────────────────────────────────
    DATABASE_URL: str = Field(
        ...,
        description="Pooled Neon connection string for async app runtime (asyncpg). "
        "Must contain -pooler in the hostname. sslmode=require mandatory.",
    )
    DATABASE_URL_DIRECT: str = Field(
        ...,
        description="Direct (non-pooled) Neon connection string for Alembic migrations only. "
        "Must NOT be used for app runtime connections.",
    )

    # SQLAlchemy async pool settings — tuned for Neon PgBouncer (transaction mode)
    DB_POOL_SIZE: int = 5          # Keep small; PgBouncer multiplexes for us
    DB_MAX_OVERFLOW: int = 5       # Total max = pool_size + max_overflow
    DB_POOL_TIMEOUT: int = 30      # Seconds to wait for a connection
    DB_POOL_RECYCLE: int = 1800    # Recycle connections every 30 minutes
    DB_POOL_PRE_PING: bool = True  # Verify connection health before use

    # ────────────────────────────────────────────────────
    # Redis
    # ────────────────────────────────────────────────────
    REDIS_URL: str = Field(..., description="Redis URL for caching and pub/sub.")
    REDIS_CELERY_URL: str = Field(..., description="Redis URL for Celery broker.")

    # ────────────────────────────────────────────────────
    # Object storage (MinIO / S3-compatible)
    # ────────────────────────────────────────────────────
    OBJECT_STORAGE_ENDPOINT: str = Field(..., description="MinIO/S3 endpoint URL.")
    OBJECT_STORAGE_ACCESS_KEY: str = Field(...)
    OBJECT_STORAGE_SECRET_KEY: str = Field(...)
    OBJECT_STORAGE_BUCKET_QUARANTINE: str = "ner-media-quarantine"
    OBJECT_STORAGE_BUCKET_CLEAN: str = "ner-media-clean"
    OBJECT_STORAGE_REGION: str = "us-east-1"

    # ────────────────────────────────────────────────────
    # Security
    # ────────────────────────────────────────────────────
    SESSION_SECRET: str = Field(..., min_length=32)
    CSRF_SECRET: str = Field(..., min_length=32)
    TOKEN_HMAC_KEY: str = Field(..., min_length=32, description="32-byte secret for session/CSRF token HMAC-SHA256 digests")
    SESSION_ABSOLUTE_LIFETIME_HOURS: int = 8
    SESSION_IDLE_TIMEOUT_MINUTES: int = 60
    STRICT_ORIGIN_CHECK: bool = False
    ALLOWED_ORIGINS: list[str] | str = Field(default_factory=lambda: ["http://localhost:3000"])

    # ────────────────────────────────────────────────────
    # OIDC Identity Provider
    # ────────────────────────────────────────────────────
    DEV_JWT_MODE: bool = False  # NEVER set True in production or staging
    OIDC_ISSUER: str = ""
    OIDC_CLIENT_ID: str = ""
    OIDC_CLIENT_SECRET: str = ""
    OIDC_REDIRECT_URI: str = "http://localhost:8000/api/v1/auth/oidc/callback"
    OIDC_SCOPES: str = "openid email profile"

    # ────────────────────────────────────────────────────
    # Business domain parameters
    # ────────────────────────────────────────────────────
    ROUTE_PLAN_EXPIRY_MINUTES: int = 30
    GPS_STALE_THRESHOLD_MINUTES: int = 15
    GPS_MAX_SPEED_KMH: int = 300
    GPS_CLOCK_SKEW_TOLERANCE_MINUTES: int = 5

    MEDIA_MAX_FILE_SIZE_MB: int = 20
    MEDIA_MAX_FILES_PER_REPORT: int = 5
    MEDIA_ALLOWED_MIME_TYPES: list[str] | str = Field(
        default_factory=lambda: ["image/jpeg", "image/png", "image/webp", "video/mp4"]
    )

    OUTBOX_AGE_ALERT_SECONDS: int = 30
    OUTBOX_MAX_RETRY_ATTEMPTS: int = 5

    # ────────────────────────────────────────────────────
    # Bhashini ULCA (Module 4 — voice-to-report ASR/translation)
    # Optional: unset in dev/hackathon environments without a registered
    # Bhashini account — the ai module's Bhashini client factory falls back
    # to a stub when these are empty, exactly like the Module 1/2/3 model
    # artifacts fall back to stubs when missing.
    # ────────────────────────────────────────────────────
    BHASHINI_USER_ID: str = ""
    BHASHINI_API_KEY: str = ""
    BHASHINI_INFERENCE_KEY: str = ""
    BHASHINI_PIPELINE_ID: str = "64392f96daac500b55c543cd"
    BHASHINI_CONFIG_URL: str = "https://meity-auth.ulcacontrib.org/ulca/apis/v0/model/getModelsPipeline"

    # ────────────────────────────────────────────────────
    # Validators
    # ────────────────────────────────────────────────────
    @field_validator("ALLOWED_ORIGINS", "MEDIA_ALLOWED_MIME_TYPES", mode="before")
    @classmethod
    def parse_str_list(cls, v: Any) -> list[str]:
        if isinstance(v, str):
            v = v.strip()
            if v.startswith("[") and v.endswith("]"):
                import json
                try:
                    return json.loads(v)
                except Exception:
                    pass
            return [item.strip() for item in v.split(",") if item.strip()]
        return v

    @field_validator("DATABASE_URL")
    @classmethod
    def validate_pooled_url(cls, v: str) -> str:
        if "pooler" not in v and "localhost" not in v and "127.0.0.1" not in v:
            raise ValueError(
                "DATABASE_URL must use the Neon pooled endpoint (contains '-pooler' in hostname). "
                "Use DATABASE_URL_DIRECT for Alembic migrations."
            )
        return v

    @model_validator(mode="after")
    def validate_production_safety(self) -> Settings:
        if self.DEV_JWT_MODE and self.APP_ENV in ("staging", "production"):
            raise ValueError(
                f"DEV_JWT_MODE=true is not allowed in {self.APP_ENV}. "
                "Staging and production must use real OIDC to catch auth bugs before deployment."
            )
        if self.APP_ENV == "production":
            if self.DEMO_MODE:
                raise ValueError("DEMO_MODE must be False in production.")
            if not self.OIDC_ISSUER:
                raise ValueError("OIDC_ISSUER is required in production.")
        return self


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    """
    Return the cached Settings singleton.

    Using lru_cache means the .env file is read only once at startup.
    In tests, call get_settings.cache_clear() to reset.
    """
    return Settings()
