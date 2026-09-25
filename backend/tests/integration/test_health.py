"""
tests/integration/test_health.py — Integration tests for health check endpoints.

These tests use httpx AsyncClient against the real app (with mocked DB/Redis
in unit mode, and real Neon DB in full integration mode).

Markers:
  @pytest.mark.unit         — no real DB/Redis needed
  @pytest.mark.integration  — requires live Neon DB + Redis
"""

from __future__ import annotations

import pytest
from httpx import AsyncClient, ASGITransport
from starlette.status import HTTP_200_OK, HTTP_503_SERVICE_UNAVAILABLE


# ──────────────────────────────────────────────────────────────
# Fixtures
# ──────────────────────────────────────────────────────────────

@pytest.fixture
async def client() -> AsyncClient:
    """
    httpx AsyncClient pointing at the FastAPI app via ASGI transport.
    No real network needed — requests go directly to the app.
    """
    from app.main import app
    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://testserver",
    ) as c:
        yield c


# ──────────────────────────────────────────────────────────────
# Liveness probe
# ──────────────────────────────────────────────────────────────

@pytest.mark.unit
class TestLivenessEndpoint:
    """GET /health/live — always returns 200 if process is running."""

    async def test_liveness_returns_200(self, client: AsyncClient) -> None:
        response = await client.get("/health/live")
        assert response.status_code == HTTP_200_OK

    async def test_liveness_body_has_status_alive(self, client: AsyncClient) -> None:
        response = await client.get("/health/live")
        assert response.json()["status"] == "alive"

    async def test_liveness_is_fast(self, client: AsyncClient) -> None:
        """Liveness must respond in under 500ms even under load."""
        import time
        start = time.monotonic()
        await client.get("/health/live")
        elapsed_ms = (time.monotonic() - start) * 1000
        assert elapsed_ms < 500, f"Liveness too slow: {elapsed_ms:.0f}ms"

    async def test_liveness_has_request_id_header(self, client: AsyncClient) -> None:
        """X-Request-ID header must be present on all responses."""
        response = await client.get("/health/live")
        assert "x-request-id" in response.headers

    async def test_liveness_accepts_client_request_id(self, client: AsyncClient) -> None:
        """Client-provided valid UUID X-Request-ID is echoed back."""
        import uuid
        client_id = str(uuid.uuid4())
        response = await client.get("/health/live", headers={"X-Request-ID": client_id})
        assert response.headers.get("x-request-id") == client_id

    async def test_liveness_rejects_invalid_request_id_by_generating_new(
        self, client: AsyncClient
    ) -> None:
        """Invalid X-Request-ID triggers generation of a new valid UUID."""
        import uuid
        response = await client.get("/health/live", headers={"X-Request-ID": "not-a-uuid"})
        returned_id = response.headers.get("x-request-id", "")
        # Should be a valid UUID (not the invalid string we sent)
        try:
            uuid.UUID(returned_id)
            is_valid_uuid = True
        except ValueError:
            is_valid_uuid = False
        assert is_valid_uuid
        assert returned_id != "not-a-uuid"


# ──────────────────────────────────────────────────────────────
# Readiness probe
# ──────────────────────────────────────────────────────────────

@pytest.mark.unit
class TestReadinessEndpoint:
    """GET /health/ready — returns 200 only when all dependencies reachable."""

    async def test_readiness_has_correct_shape(self, client: AsyncClient) -> None:
        """Response always has 'status' and 'checks' keys."""
        response = await client.get("/health/ready")
        body = response.json()
        assert "status" in body
        assert "checks" in body
        assert "database" in body["checks"]
        assert "redis" in body["checks"]

    async def test_readiness_status_ok_when_all_healthy(
        self, client: AsyncClient, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        """When DB + Redis both healthy, status is ok and HTTP 200."""
        async def mock_healthy_db():
            return {"status": "ok", "postgis_version": "3.3.0"}

        monkeypatch.setattr(
            "app.api.health.check_db_connectivity",
            mock_healthy_db,
        )

        import redis.asyncio as aioredis
        original_from_url = aioredis.from_url

        class FakeRedis:
            async def ping(self) -> bool:
                return True
            async def aclose(self) -> None:
                pass

        monkeypatch.setattr(aioredis, "from_url", lambda *a, **kw: FakeRedis())

        response = await client.get("/health/ready")
        assert response.status_code == HTTP_200_OK
        assert response.json()["status"] == "ok"

    async def test_readiness_503_when_db_unhealthy(
        self, client: AsyncClient, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        """DB failure → 503 degraded status."""
        async def mock_unhealthy_db():
            return {"status": "error", "detail": "connection refused"}

        monkeypatch.setattr(
            "app.api.health.check_db_connectivity",
            mock_unhealthy_db,
        )
        response = await client.get("/health/ready")
        assert response.status_code == HTTP_503_SERVICE_UNAVAILABLE
        assert response.json()["status"] == "degraded"
        assert response.json()["checks"]["database"] == "error"

    async def test_readiness_ok_when_redis_unavailable_in_dev(
        self, client: AsyncClient, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        """In development mode, unreachable Redis reports standby without failing 503."""
        async def mock_healthy_db():
            return {"status": "ok", "postgis_version": "3.3.0"}

        monkeypatch.setattr("app.api.health.check_db_connectivity", mock_healthy_db)

        import redis.asyncio as aioredis

        class BrokenRedis:
            async def ping(self) -> bool:
                raise ConnectionError("Connection refused")

            async def aclose(self) -> None:
                pass

        monkeypatch.setattr(aioredis, "from_url", lambda *a, **kw: BrokenRedis())

        from app.core.config import get_settings
        settings = get_settings()
        monkeypatch.setattr(settings, "APP_ENV", "development")

        response = await client.get("/health/ready")
        assert response.status_code == HTTP_200_OK
        assert response.json()["status"] == "ok"
        assert response.json()["checks"]["redis"] == "standby (dev mode)"

    async def test_readiness_503_when_redis_unavailable_in_production(
        self, client: AsyncClient, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        """In production, unreachable Redis fails the readiness probe (503 degraded)."""
        async def mock_healthy_db():
            return {"status": "ok", "postgis_version": "3.3.0"}

        monkeypatch.setattr("app.api.health.check_db_connectivity", mock_healthy_db)

        import redis.asyncio as aioredis

        class BrokenRedis:
            async def ping(self) -> bool:
                raise ConnectionError("Connection refused")

            async def aclose(self) -> None:
                pass

        monkeypatch.setattr(aioredis, "from_url", lambda *a, **kw: BrokenRedis())

        from app.core.config import get_settings
        settings = get_settings()
        monkeypatch.setattr(settings, "APP_ENV", "production")
        monkeypatch.setattr(settings, "DEMO_MODE", False)

        response = await client.get("/health/ready")
        assert response.status_code == HTTP_503_SERVICE_UNAVAILABLE
        assert response.json()["status"] == "degraded"
        assert response.json()["checks"]["redis"] == "error"

    async def test_readiness_no_sensitive_info_in_response(
        self, client: AsyncClient
    ) -> None:
        """Readiness must not expose passwords, connection strings, or stack traces."""
        response = await client.get("/health/ready")
        body_str = response.text.lower()
        sensitive_words = ["password", "secret", "token", "traceback", "postgresql://"]
        for word in sensitive_words:
            assert word not in body_str, f"Sensitive word '{word}' found in health response"

    async def test_readiness_has_request_id_header(self, client: AsyncClient) -> None:
        response = await client.get("/health/ready")
        assert "x-request-id" in response.headers


# ──────────────────────────────────────────────────────────────
# OpenAPI schema export
# ──────────────────────────────────────────────────────────────

@pytest.mark.unit
class TestOpenAPISchema:
    """GET /api/v1/openapi.json — schema must be exportable."""

    async def test_openapi_schema_accessible(self, client: AsyncClient) -> None:
        response = await client.get("/api/v1/openapi.json")
        assert response.status_code == HTTP_200_OK

    async def test_openapi_schema_has_required_fields(self, client: AsyncClient) -> None:
        response = await client.get("/api/v1/openapi.json")
        schema = response.json()
        assert "openapi" in schema
        assert "info" in schema
        assert "paths" in schema
        assert schema["info"]["version"] == "0.1.0"

    async def test_openapi_schema_includes_health_endpoints(
        self, client: AsyncClient
    ) -> None:
        response = await client.get("/api/v1/openapi.json")
        schema = response.json()
        paths = schema.get("paths", {})
        assert "/health/live" in paths
        assert "/health/ready" in paths
