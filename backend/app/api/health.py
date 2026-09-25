"""
app/api/health.py — Health check endpoints.

GET /health/live   — liveness probe (process is running)
GET /health/ready  — readiness probe (DB + Redis reachable)

Design:
- No authentication required (load balancers call these)
- No sensitive diagnostic information in responses
- /health/ready performs actual connectivity checks (not cached)
- Response schema is stable (monitoring depends on it)
"""

from __future__ import annotations

from fastapi import APIRouter
from fastapi.responses import ORJSONResponse
from starlette.status import HTTP_200_OK, HTTP_503_SERVICE_UNAVAILABLE

from app.core.db import check_db_connectivity

router = APIRouter()


@router.get(
    "/health/live",
    summary="Liveness probe",
    description="Returns 200 if the process is alive. Used by load balancers.",
    response_description="Always 200 if process is running.",
    include_in_schema=True,
)
async def liveness() -> ORJSONResponse:
    """Liveness probe — always returns 200 if the process is running."""
    return ORJSONResponse(
        status_code=HTTP_200_OK,
        content={"status": "alive"},
    )


@router.get(
    "/health/ready",
    summary="Readiness probe",
    description="Returns 200 only when both PostgreSQL (Neon) and Redis are reachable.",
    response_description="200 if ready, 503 if any dependency is unavailable.",
    include_in_schema=True,
)
async def readiness() -> ORJSONResponse:
    """
    Readiness probe — checks DB and Redis connectivity.

    Returns 200 with status=ok when all checks pass.
    Returns 503 with status=degraded if any check fails.

    NOTE: No sensitive diagnostics are included. Version info is safe to expose.
    """
    import redis.asyncio as aioredis

    from app.core.config import get_settings

    settings = get_settings()

    # Check PostgreSQL + PostGIS
    db_status = await check_db_connectivity()

    # Check Redis
    redis_ok = False
    try:
        redis_url = settings.REDIS_URL.replace("localhost", "127.0.0.1")
        client = aioredis.from_url(redis_url, socket_timeout=2.0)
        await client.ping()
        await client.aclose()
        redis_ok = True
    except Exception:
        pass

    is_dev = settings.APP_ENV != "production" or settings.DEMO_MODE

    # In development / demo mode, Redis is optional (it fails open in rate limiting and startup).
    # In production, both PostgreSQL and Redis are strictly required.
    if is_dev:
        all_ok = db_status["status"] == "ok"
        redis_check = "ok" if redis_ok else "standby (dev mode)"
    else:
        all_ok = db_status["status"] == "ok" and redis_ok
        redis_check = "ok" if redis_ok else "error"

    response_body: dict[str, object] = {
        "status": "ok" if all_ok else "degraded",
        "checks": {
            "database": db_status["status"],
            "redis": redis_check,
        },
    }

    # Include non-sensitive version info when available
    if db_status.get("postgis_version"):
        response_body["postgis_version"] = db_status["postgis_version"]

    return ORJSONResponse(
        status_code=HTTP_200_OK if all_ok else HTTP_503_SERVICE_UNAVAILABLE,
        content=response_body,
    )
