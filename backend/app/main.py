"""
app/main.py — FastAPI application factory.

Lifespan events:
  startup:  verify DB connectivity, Redis ping, configure logging
  shutdown: dispose DB engine cleanly

Health endpoints:
  GET /health/live   — liveness probe (is the process running?)
  GET /health/ready  — readiness probe (is DB + Redis reachable?)

OpenAPI:
  GET /api/v1/openapi.json — schema export
"""

from __future__ import annotations

from contextlib import asynccontextmanager
from typing import Any

import redis.asyncio as aioredis
from fastapi import FastAPI
from fastapi.responses import ORJSONResponse

from app.core.config import get_settings
from app.core.db import check_db_connectivity, get_engine
from app.core.exceptions import AppError, app_error_handler, unhandled_error_handler
from app.core.logging import configure_logging, get_logger
from app.core.middleware import register_middleware

logger = get_logger(__name__)


# ──────────────────────────────────────────────────────────────
# Redis connectivity helper
# ──────────────────────────────────────────────────────────────

async def _check_redis_connectivity() -> dict[str, str]:
    """Ping Redis and return status dict."""
    settings = get_settings()
    try:
        client = aioredis.from_url(settings.REDIS_URL, socket_timeout=3.0)
        pong = await client.ping()
        await client.aclose()
        return {"status": "ok", "ping": str(pong)}
    except Exception as exc:
        return {"status": "error", "detail": str(exc)[:200]}


# ──────────────────────────────────────────────────────────────
# Application lifespan
# ──────────────────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):  # type: ignore[type-arg]
    """
    Application lifespan manager.

    Startup: configure logging, verify DB + Redis connectivity.
    Shutdown: dispose DB connection pool cleanly.
    """
    settings = get_settings()

    # Configure structured logging first so startup errors are captured
    configure_logging(settings.LOG_LEVEL)

    logger.info(
        "application_starting",
        env=settings.APP_ENV,
        demo_mode=settings.DEMO_MODE,
        dev_jwt_mode=settings.DEV_JWT_MODE,
    )

    if settings.DEV_JWT_MODE:
        logger.warning(
            "DEV_JWT_MODE_ACTIVE",
            message="⚠️ DEV_JWT_MODE is active. Never deploy this configuration to production.",
            app_env=settings.APP_ENV,
        )

    # In production, verify database & Redis connectivity strictly on startup
    if settings.APP_ENV == "production":
        db_status = await check_db_connectivity()
        if db_status["status"] != "ok":
            logger.error("database_connectivity_failed", detail=db_status.get("detail"))
            raise RuntimeError(f"Database not reachable at startup: {db_status.get('detail')}")

        logger.info(
            "database_ready",
            postgres_version=db_status.get("postgres_version", ""),
            postgis_version=db_status.get("postgis_version", ""),
        )

        redis_status = await _check_redis_connectivity()
        if redis_status["status"] != "ok":
            logger.error("redis_connectivity_failed", detail=redis_status.get("detail"))
            raise RuntimeError(f"Redis not reachable at startup: {redis_status.get('detail')}")

    # Verify and seed regional network geometry & road curvatures
    try:
        from app.core.db import AsyncSessionLocal
        from app.modules.network.application.seed_regional_network import seed_regional_network
        async with AsyncSessionLocal() as session:
            await seed_regional_network(session)
            await session.commit()
            logger.info("regional_network_geometry_verified_and_seeded")
    except Exception as exc:
        logger.warning("regional_network_seed_skipped", error=str(exc))

    logger.info("application_ready")

    yield  # ← Application runs here

    # Shutdown
    logger.info("application_shutting_down")
    await get_engine().dispose()
    logger.info("database_pool_disposed")


# ──────────────────────────────────────────────────────────────
# Application factory
# ──────────────────────────────────────────────────────────────

def create_app() -> FastAPI:
    """
    Create and configure the FastAPI application.

    All configuration is read from Settings (environment variables).
    """
    settings = get_settings()

    app = FastAPI(
        title="NER Smart Logistics & Accessibility Intelligence Platform",
        description=(
            "Backend API for the Smart Logistics & Accessibility Intelligence Platform "
            "for North-East India (SIH 2026 — Problem 26002, MDoNER). "
            "Supports field incident reporting, road network status, routing, "
            "fleet tracking, and logistics coordination for humanitarian operations."
        ),
        version="0.1.0",
        docs_url="/api/docs" if settings.APP_ENV != "production" else None,
        redoc_url="/api/redoc" if settings.APP_ENV != "production" else None,
        openapi_url="/api/v1/openapi.json",
        default_response_class=ORJSONResponse,
        lifespan=lifespan,
        contact={
            "name": "SIH 2026 Team",
        },
        license_info={
            "name": "Restricted — Pilot Use Only",
        },
    )

    # Register middleware (order matters — see middleware.py)
    register_middleware(app, allowed_origins=settings.ALLOWED_ORIGINS)

    # Register exception handlers
    app.add_exception_handler(AppError, app_error_handler)  # type: ignore[arg-type]
    app.add_exception_handler(Exception, unhandled_error_handler)  # type: ignore[arg-type]

    # Metrics endpoint
    from fastapi import Response as RawResponse
    from prometheus_client import CONTENT_TYPE_LATEST, generate_latest

    @app.get("/metrics", include_in_schema=False)
    def metrics() -> RawResponse:
        return RawResponse(content=generate_latest(), media_type=CONTENT_TYPE_LATEST)

    # Register routers
    _register_routers(app)

    return app


def _register_routers(app: FastAPI) -> None:
    """Register all API routers. Each Phase adds its module routers here."""
    from fastapi import Depends
    from sqlalchemy.ext.asyncio import AsyncSession
    from app.api.health import router as health_router
    from app.core.config import get_settings
    from app.core.db import get_db
    from app.modules.identity.api import router as identity_router

    settings = get_settings()

    # Health probes (no auth required — used by load balancer and monitoring)
    app.include_router(health_router, tags=["Health"])

    # Phase 2: identity router
    app.include_router(identity_router)

    # Phase 3: road network & spatial intelligence router
    from app.modules.network.api import router as network_router
    app.include_router(network_router, prefix="/api/v1")

    # Phase 4: field reporting & media router
    from app.modules.reporting.api import router as reporting_router
    app.include_router(reporting_router, prefix="/api/v1")

    # Phase 4: incident adjudication & road traversability router
    from app.modules.incidents.api import router as incidents_router
    app.include_router(incidents_router, prefix="/api/v1")

    # Phase 5: fleet logistics & dispatch router
    from app.modules.logistics.api import router as logistics_router
    app.include_router(logistics_router, prefix="/api/v1")

    # Phase 5: telemetry & tracking router
    from app.modules.telemetry.api import router as telemetry_router
    app.include_router(telemetry_router, prefix="/api/v1")

    # Phase 6: constrained routing & dispatch decisions router
    from app.modules.routing.api import router as routing_router
    app.include_router(routing_router, prefix="/api/v1")

    # Phase 6: disruption impact & reachability router
    from app.modules.impact.api import router as impact_router
    app.include_router(impact_router, prefix="/api/v1")

    # Phase 7: AI/ML inference router (risk prediction, hazard verification, ETA)
    from app.modules.ai.api import router as ai_router
    app.include_router(ai_router, prefix="/api/v1")

    # Phase 7: landslide/rainfall hazard risk router
    from app.modules.hazard.api import router as hazard_router
    app.include_router(hazard_router, prefix="/api/v1")

    # Coordination: jurisdictions reference data and acknowledge/escalate/assign log
    from app.modules.coordination.api import router as coordination_router
    app.include_router(coordination_router, prefix="/api/v1")

    # Anonymous public-citizen surface — no session required, rate-limited per IP.
    from app.modules.public.api import router as public_router
    app.include_router(public_router, prefix="/api/v1")

    # Demo seed endpoint (active when DEMO_MODE=true)
    if settings.DEMO_MODE:
        @app.post("/api/v1/seed-demo", tags=["Demo"])
        async def run_demo_seed(db: AsyncSession = Depends(get_db)) -> dict[str, str]:
            from app.scripts.seed_demo import seed_demo_data
            await seed_demo_data(db)
            return {"status": "ok", "message": "Demo data seeded successfully"}


# Module-level app instance for uvicorn
app = create_app()
