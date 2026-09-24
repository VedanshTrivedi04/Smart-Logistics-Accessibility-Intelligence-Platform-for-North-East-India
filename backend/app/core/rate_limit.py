"""
app/core/rate_limit.py — Redis-backed per-IP rate limiting for anonymous endpoints.

Only the anonymous public-citizen routes (app/modules/public) use this. Every other
route is reached through a session, so abuse there is already accountable (the
session/membership can be revoked); an anonymous route has no such accountability,
so it is rate-limited per client IP instead.

Behavior when Redis itself is unreachable:
- production: fail closed (reject the request) — an attacker should not be able to
  disable rate limiting by taking down Redis.
- non-production: fail open (allow the request, log a warning) — local development
  should not require a running Redis just to exercise these routes.
"""

from __future__ import annotations

from collections.abc import Awaitable, Callable

import redis.asyncio as aioredis
from fastapi import Request

from app.core.config import get_settings
from app.core.exceptions import RateLimitError
from app.core.logging import get_logger

logger = get_logger(__name__)

_redis_client: aioredis.Redis | None = None


def _get_redis_client() -> aioredis.Redis:
    global _redis_client
    client = _redis_client
    if client is None:
        settings = get_settings()
        client = aioredis.from_url(settings.REDIS_URL, socket_timeout=2.0)
        _redis_client = client
    return client


def _client_ip(request: Request) -> str:
    # Best-effort: a single reverse proxy hop is assumed (Fix 12's origin checks are
    # the actual trust boundary). This is an abuse deterrent, not a security control.
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def rate_limit(
    name: str, *, limit: int, window_seconds: int
) -> Callable[[Request], Awaitable[None]]:
    """
    FastAPI dependency factory. Allows at most `limit` requests per `window_seconds`,
    counted per client IP, for the given logical route `name`.
    """

    async def _dependency(request: Request) -> None:
        ip = _client_ip(request)
        key = f"ratelimit:public:{name}:{ip}"
        settings = get_settings()
        try:
            client = _get_redis_client()
            count = await client.incr(key)
            if count == 1:
                await client.expire(key, window_seconds)
        except Exception as exc:
            logger.warning("rate_limit_backend_unavailable", route=name)
            if settings.APP_ENV == "production":
                raise RateLimitError(
                    "Rate limiting is temporarily unavailable; try again shortly."
                ) from exc
            return
        if count > limit:
            raise RateLimitError(
                f"Too many requests to this public endpoint (limit {limit} per {window_seconds}s).",
                details={"limit": limit, "window_seconds": window_seconds},
            )

    return _dependency
