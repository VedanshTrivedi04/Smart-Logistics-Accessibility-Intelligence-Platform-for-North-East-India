"""
alembic/env.py — Async-compatible Alembic environment for Neon PostgreSQL.

KEY RULES:
1. Uses DATABASE_URL_DIRECT (non-pooled) — Alembic needs persistent connections.
   NEVER use the pooled DATABASE_URL for migrations.
2. Uses asyncpg driver via run_sync pattern for async compatibility.
3. Loads all SQLAlchemy models to enable autogenerate.
4. Extensions (PostGIS, pgRouting) are pre-installed on Neon — NOT created here.
5. Runs as ner_admin (migration role), NOT as app_user (runtime role).
"""

from __future__ import annotations

import asyncio
import os
import sys
from logging.config import fileConfig
from pathlib import Path

from alembic import context
from sqlalchemy import pool
from sqlalchemy.engine import Connection
from sqlalchemy.ext.asyncio import async_engine_from_config

# ──────────────────────────────────────────────────────────────
# Add project root to path so app modules are importable
# ──────────────────────────────────────────────────────────────
sys.path.insert(0, str(Path(__file__).parent.parent))

# ──────────────────────────────────────────────────────────────
# Import all models so autogenerate can detect them
# As new modules are added in later phases, import their models here.
# ──────────────────────────────────────────────────────────────
from app.core.db import Base  # noqa: F401 — Base with metadata

# Phase 2 models
from app.modules.identity.infrastructure.models import (  # noqa: F401
    AuthTransactionModel,
    CSRFTokenModel,
    GrantModel,
    JurisdictionModel,
    MembershipModel,
    OrganizationModel,
    SessionModel,
    SharingGrantModel,
    UserModel,
)

# Phase 3 models
from app.modules.network.infrastructure.models import (  # noqa: F401
    BridgeEdgeModel,
    BridgeModel,
    EdgeRestrictionModel,
    EdgeStatusCurrentModel,
    EdgeStatusEventModel,
    FacilityModel,
    NetworkVersionModel,
    RoadEdgeModel,
    RoadNodeModel,
)

# Phase 7 models
from app.modules.ai.infrastructure.models import (  # noqa: F401
    EdgeTerrainFeaturesModel,
    EdgeWeatherFeaturesModel,
    LandslideEventModel,
)

# Alembic config object
config = context.config

# Set up stdlib logging from alembic.ini
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# ──────────────────────────────────────────────────────────────
# Load DATABASE_URL_DIRECT from environment
# IMPORTANT: Use the DIRECT (non-pooled) connection for Alembic
# ──────────────────────────────────────────────────────────────
def _get_migration_url() -> str:
    """
    Get the migration database URL.

    Priority:
    1. DATABASE_URL_DIRECT env var (preferred, non-pooled Neon endpoint)
    2. DATABASE_URL env var (fallback, but will log a warning)

    Never uses the pooled endpoint for migrations — Alembic needs
    persistent connections that PgBouncer transaction mode cannot provide.
    """
    direct_url = os.environ.get("DATABASE_URL_DIRECT", "")
    if direct_url:
        return direct_url

    fallback_url = os.environ.get("DATABASE_URL", "")
    if fallback_url:
        import warnings
        warnings.warn(
            "DATABASE_URL_DIRECT not set; falling back to DATABASE_URL for migrations. "
            "This may fail with PgBouncer (pooled) connections. "
            "Set DATABASE_URL_DIRECT to the non-pooled Neon endpoint.",
            stacklevel=2,
        )
        return fallback_url

    try:
        from app.core.config import get_settings
        s = get_settings()
        if s.DATABASE_URL_DIRECT:
            return s.DATABASE_URL_DIRECT
        if s.DATABASE_URL:
            return s.DATABASE_URL
    except Exception:
        pass

    raise RuntimeError(
        "Neither DATABASE_URL_DIRECT nor DATABASE_URL is set. "
        "Cannot run Alembic migrations."
    )


def _normalise_url(url: str) -> str:
    """
    Convert asyncpg URL scheme to sync psycopg2 scheme for Alembic sync mode.
    Alembic's run_sync pattern requires a sync-compatible URL.
    We use async_engine_from_config so this is not needed — kept for reference.
    """
    return url


# Build configuration dict for async engine
def _get_engine_config() -> dict[str, str]:
    migration_url = _get_migration_url()
    return {
        "sqlalchemy.url": migration_url,
        "sqlalchemy.connect_args.ssl": "require",
        # Disable prepared statement cache for Neon compatibility
        "sqlalchemy.connect_args.statement_cache_size": "0",
    }


# Target metadata for autogenerate
target_metadata = Base.metadata


# ──────────────────────────────────────────────────────────────
# Offline migrations (--sql mode, generates SQL without connecting)
# ──────────────────────────────────────────────────────────────

def run_migrations_offline() -> None:
    """Run migrations in offline mode (generates SQL output, no DB connection)."""
    url = _get_migration_url()
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        compare_type=True,
        compare_server_default=True,
    )
    with context.begin_transaction():
        context.run_migrations()


# ──────────────────────────────────────────────────────────────
# Online migrations (async, connects to live Neon DB)
# ──────────────────────────────────────────────────────────────

def do_run_migrations(connection: Connection) -> None:
    """Configure Alembic context and run migrations on the given connection."""
    context.configure(
        connection=connection,
        target_metadata=target_metadata,
        compare_type=True,
        compare_server_default=True,
        # Include schemas (PostGIS creates geometry_columns etc.)
        include_schemas=True,
        # Exclude PostGIS/pgRouting internal tables from autogenerate
        exclude_tables=[
            "spatial_ref_sys",
            "geometry_columns",
            "geography_columns",
            "raster_columns",
            "raster_overviews",
        ],
    )
    with context.begin_transaction():
        context.run_migrations()


async def run_async_migrations() -> None:
    """Create async engine and run migrations."""
    from sqlalchemy.ext.asyncio import create_async_engine

    migration_url = _get_migration_url()
    connectable = create_async_engine(
        migration_url,
        connect_args={
            "ssl": "require",
            "statement_cache_size": 0,
        },
        poolclass=pool.NullPool,  # No connection pooling for migrations
    )

    async with connectable.connect() as connection:
        await connection.run_sync(do_run_migrations)

    await connectable.dispose()


def run_migrations_online() -> None:
    """Entry point for online migration mode."""
    asyncio.run(run_async_migrations())


# ──────────────────────────────────────────────────────────────
# Entry point
# ──────────────────────────────────────────────────────────────

if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
