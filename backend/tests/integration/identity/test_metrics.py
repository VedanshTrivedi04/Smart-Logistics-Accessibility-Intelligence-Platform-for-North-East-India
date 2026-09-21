"""
tests/integration/identity/test_metrics.py — Integration tests for Prometheus counters.

Fix 18:
- GET /metrics endpoint exposure
- Auth success/failure counters incrementing
"""

from __future__ import annotations

import uuid

import pytest
from httpx import ASGITransport, AsyncClient
from starlette.status import HTTP_200_OK

from app.main import app


@pytest.fixture
async def client() -> AsyncClient:
    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://testserver",
    ) as c:
        yield c


class TestMetrics:
    async def test_metrics_endpoint_accessible(self, client: AsyncClient) -> None:
        response = await client.get("/metrics")
        assert response.status_code == HTTP_200_OK
        text = response.text
        assert "ner_auth_success_total" in text
        assert "ner_auth_failure_total" in text
        assert "ner_authz_denied_total" in text

    async def test_auth_metrics_increment_on_requests(self, client: AsyncClient) -> None:
        # Successful dev request
        await client.get(
            "/api/v1/me",
            headers={"X-Dev-User-Id": str(uuid.uuid4())},
        )
        # Failed request
        await client.get(
            "/api/v1/me",
            headers={"X-Dev-User-Id": ""},
        )

        response = await client.get("/metrics")
        assert response.status_code == HTTP_200_OK
        text = response.text
        assert 'ner_auth_success_total{auth_method="dev_header"}' in text
