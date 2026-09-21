"""
app/core/db.py — Async SQLAlchemy engine factory for Neon PostgreSQL.

KEY DESIGN DECISIONS:
- DATABASE_URL (pooled, PgBouncer) → application runtime sessions
- DATABASE_URL_DIRECT (non-pooled) → Alembic migrations ONLY
- SQLAlchemy connection pool is SMALL by design; PgBouncer handles multiplexing
- Per-transaction SET LOCAL context sets RLS user/org parameters
- app_user (non-owner, non-superuser) is the runtime role — never the migration role
"""

from __future__ import annotations

import contextlib
from collections.abc import AsyncGenerator
from typing import Any

from sqlalchemy import event, text
from sqlalchemy.ext.asyncio import (
    AsyncConnection,
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.orm import DeclarativeBase

from app.core.config import get_settings


class Base(DeclarativeBase):
    """
    SQLAlchemy declarative base for all ORM models.

    All models inherit from this class. The registry is shared
    so Alembic autogenerate can discover all models automatically.
    """


# ──────────────────────────────────────────────────────────────
# Engine factory — Neon-specific configuration
# ──────────────────────────────────────────────────────────────

def _build_engine() -> AsyncEngine:
    """
    Build the async SQLAlchemy engine connected to Neon via PgBouncer.

    Neon PgBouncer runs in TRANSACTION mode, which means:
    - Connection-level state (SET, prepared statements, LISTEN/NOTIFY) is NOT safe
    - We use SET LOCAL (transaction-scoped) for RLS context — this IS safe
    - Statement-level prepared caching is disabled (statement_cache_size=0)
    """
    settings = get_settings()

    import os
    from sqlalchemy.pool import NullPool

    if os.environ.get("USE_NULL_POOL") == "true" or os.environ.get("PYTEST_CURRENT_TEST"):
        return create_async_engine(
            settings.DATABASE_URL,
            connect_args={
                "ssl": "require",
                "server_settings": {
                    "application_name": "ner-logistics-test",
                    "jit": "off",
                },
                "statement_cache_size": 0,
                "prepared_statement_cache_size": 0,
            },
            poolclass=NullPool,
            json_serializer=_json_serializer,
            json_deserializer=_json_deserializer,
            echo=False,
        )

    return create_async_engine(
        settings.DATABASE_URL,
        # asyncpg connection arguments
        connect_args={
            "ssl": "require",
            "server_settings": {
                "application_name": "ner-logistics-api",
                "jit": "off",  # Disable JIT for short-lived serverless queries
            },
            # Disable asyncpg's statement cache — required for PgBouncer transaction mode
            "statement_cache_size": 0,
            "prepared_statement_cache_size": 0,
        },
        # Pool settings — kept small because PgBouncer multiplexes for us
        pool_size=get_settings().DB_POOL_SIZE,
        max_overflow=get_settings().DB_MAX_OVERFLOW,
        pool_timeout=get_settings().DB_POOL_TIMEOUT,
        pool_recycle=get_settings().DB_POOL_RECYCLE,
        pool_pre_ping=get_settings().DB_POOL_PRE_PING,
        # Serialise Python-side JSON with orjson for performance
        json_serializer=_json_serializer,
        json_deserializer=_json_deserializer,
        echo=get_settings().APP_ENV == "development",
    )


def _json_serializer(obj: Any) -> str:
    import orjson
    return orjson.dumps(obj).decode()


def _json_deserializer(s: str) -> Any:
    import orjson
    return orjson.loads(s)


# Module-level engine singleton (created once at import time)
_engine: AsyncEngine | None = None


def get_engine() -> AsyncEngine:
    """Return the module-level engine singleton, creating it if needed."""
    global _engine
    if _engine is None:
        _engine = _build_engine()
    return _engine


# ──────────────────────────────────────────────────────────────
# Session factory
# ──────────────────────────────────────────────────────────────

def _build_session_factory() -> async_sessionmaker[AsyncSession]:
    return async_sessionmaker(
        bind=get_engine(),
        class_=AsyncSession,
        expire_on_commit=False,  # Avoid lazy-load errors after commit
        autoflush=False,
        autocommit=False,
    )


AsyncSessionLocal = _build_session_factory()


# ──────────────────────────────────────────────────────────────
# FastAPI dependency
# ──────────────────────────────────────────────────────────────

async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """
    FastAPI dependency that yields a scoped async DB session.

    Usage:
        async def my_endpoint(db: AsyncSession = Depends(get_db)):
            ...

    The session is automatically closed after the request completes.
    Rollback on exception is handled by SQLAlchemy's context manager.
    """
    async with AsyncSessionLocal() as session:
        try:
            yield session
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()


# ──────────────────────────────────────────────────────────────
# RLS transaction context helper
# ──────────────────────────────────────────────────────────────

async def set_transaction_rls_context(
    session: AsyncSession,
    *,
    user_id: str | None = None,
    org_id: str | None = None,
    session_id: str | None = None,
    role: str | None = None,
) -> None:
    """
    Set PostgreSQL RLS context for the current transaction (Fix 3).

    Uses SET LOCAL so the values are scoped to this transaction only
    and automatically cleared when the transaction ends (commit or rollback).
    This is safe with PgBouncer transaction mode.

    Parameters set:
    - app.current_user_id
    - app.current_org_id
    - app.current_session_id
    - app.current_role
    """
    if user_id:
        await session.execute(
            text("SELECT set_config('app.current_user_id', :val, true)"),
            {"val": str(user_id)},
        )
    if org_id:
        await session.execute(
            text("SELECT set_config('app.current_org_id', :val, true)"),
            {"val": str(org_id)},
        )
    if session_id:
        await session.execute(
            text("SELECT set_config('app.current_session_id', :val, true)"),
            {"val": str(session_id)},
        )
    if role:
        await session.execute(
            text("SELECT set_config('app.current_role', :val, true)"),
            {"val": str(role)},
        )


DbSession = AsyncSession
get_db_session = get_db

# ──────────────────────────────────────────────────────────────
# Health check helper
# ──────────────────────────────────────────────────────────────

async def check_db_connectivity() -> dict[str, str]:
    """
    Ping the database and return version information.

    Used by /health/ready endpoint. Returns a dict suitable
    for JSON serialization. Never raises — returns an error dict instead.
    """
    try:
        async with get_engine().connect() as conn:
            result = await conn.execute(text("SELECT version()"))
            row = result.fetchone()
            version = row[0] if row else "unknown"
            # Check PostGIS
            pg_result = await conn.execute(text("SELECT PostGIS_version()"))
            pg_row = pg_result.fetchone()
            postgis_version = pg_row[0] if pg_row else "unknown"
            return {
                "status": "ok",
                "postgres_version": version[:60],
                "postgis_version": postgis_version[:30],
            }
    except Exception as exc:
        return {"status": "error", "detail": str(exc)[:200]}


@contextlib.asynccontextmanager
async def get_connection() -> AsyncGenerator[AsyncConnection, None]:
    """
    Async context manager for a raw connection (used in migrations and health checks).
    """
    async with get_engine().connect() as conn:
        yield conn
