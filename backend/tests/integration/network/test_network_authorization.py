"""
tests/integration/network/test_network_authorization.py — Integration tests for network endpoint security & RBAC capabilities.
"""

from __future__ import annotations

import uuid

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import text

from app.core.db import AsyncSessionLocal
from app.main import app
from app.modules.identity.domain.enums import Role


@pytest.fixture
async def sample_edge_id() -> str:
    async with AsyncSessionLocal() as session:
        res = await session.execute(text("SELECT id FROM road_edges LIMIT 1"))
        row = res.first()
        if not row:
            pytest.skip("No edges found")
        return str(row[0])


@pytest.fixture
async def sample_user_id() -> str:
    async with AsyncSessionLocal() as session:
        res = await session.execute(text("SELECT id FROM users LIMIT 1"))
        row = res.first()
        if row:
            return str(row[0])
        u_id = uuid.uuid4()
        await session.execute(
            text("""
                INSERT INTO users (id, issuer, subject, email, display_name, is_active, created_at, updated_at)
                VALUES (:id, 'https://auth.nerlogistics.gov.in', 'sub_verifier_1', 'verifier@nerlogistics.gov.in', 'District Verifier', true, NOW(), NOW())
            """),
            {"id": u_id},
        )
        await session.commit()
        return str(u_id)


class TestNetworkAuthorization:
    async def test_get_edges_requires_authentication(self) -> None:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.get("/api/v1/network/edges?min_lon=91.0&min_lat=25.0&max_lon=92.0&max_lat=26.0")
            assert resp.status_code == 401

    async def test_get_edges_accessible_when_authenticated(self) -> None:
        headers = {
            "X-Dev-User-Id": str(uuid.uuid4()),
            "X-Dev-Org-Id": str(uuid.uuid4()),
            "X-Dev-Role": Role.TRANSPORT_OPERATOR.value,
        }
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.get(
                "/api/v1/network/edges?min_lon=91.0&min_lat=25.0&max_lon=92.5&max_lat=26.5",
                headers=headers,
            )
            assert resp.status_code == 200
            data = resp.json()
            assert data["type"] == "FeatureCollection"

    async def test_declare_status_allowed_for_district_verifier(self, sample_edge_id: str, sample_user_id: str) -> None:
        headers = {
            "X-Dev-User-Id": sample_user_id,
            "X-Dev-Org-Id": str(uuid.uuid4()),
            "X-Dev-Role": Role.DISTRICT_VERIFIER.value,
        }
        payload = {
            "status": "RESTRICTED",
            "reason": "Road maintenance on single lane",
            "restrictions": {"max_speed": 30},
        }
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.post(
                f"/api/v1/network/edges/{sample_edge_id}/status",
                headers=headers,
                json=payload,
            )
            assert resp.status_code == 200
            data = resp.json()
            assert data["status"] == "RESTRICTED"

    async def test_declare_status_forbidden_for_transport_operator(self, sample_edge_id: str) -> None:
        headers = {
            "X-Dev-User-Id": str(uuid.uuid4()),
            "X-Dev-Org-Id": str(uuid.uuid4()),
            "X-Dev-Role": Role.TRANSPORT_OPERATOR.value,
        }
        payload = {
            "status": "BLOCKED",
            "reason": "Driver observed a blockage",
        }
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.post(
                f"/api/v1/network/edges/{sample_edge_id}/status",
                headers=headers,
                json=payload,
            )
            assert resp.status_code == 403
