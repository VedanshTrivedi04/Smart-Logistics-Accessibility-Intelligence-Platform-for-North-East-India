"""
tests/integration/impact/test_edge_impacts.py — Integration tests for edge-indexed disruption impact assessment.
"""

from __future__ import annotations

from datetime import datetime, timezone
import uuid
import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import text

from app.core.db import AsyncSessionLocal
from app.main import app
from app.modules.identity.domain.enums import Capability, OrgKind, Role
from app.modules.impact.domain.entities import TripImpact
from app.modules.impact.domain.enums import ImpactSeverity, ImpactType, RecommendedAction
from app.modules.impact.infrastructure.repository import SqlAlchemyImpactRepository


class TestEdgeImpactsIntegration:
    async def test_list_trip_impacts_by_edge(self) -> None:
        async with AsyncSessionLocal() as session:
            # 1. Fetch an edge and a trip
            edge_res = await session.execute(text("SELECT id FROM road_edges LIMIT 1"))
            edge_id = edge_res.scalar_one()

            trip_res = await session.execute(text("SELECT id, organization_id FROM trips LIMIT 1"))
            trip_row = trip_res.first()
            if not trip_row:
                pytest.skip("No trips seeded in dev DB")

            trip_id, org_id = trip_row[0], trip_row[1]

            repo = SqlAlchemyImpactRepository(session)
            impact = TripImpact(
                id=uuid.uuid4(),
                trip_id=trip_id,
                incident_id=None,
                edge_id=edge_id,
                source_event_id=uuid.uuid4(),
                source_status_version=1,
                assessment_version=1,
                impact_type=ImpactType.BLOCKED_ROUTE,
                severity=ImpactSeverity.CRITICAL,
                delay_estimated_seconds=1800,
                distance_to_disruption_meters=12500.0,
                recommended_action=RecommendedAction.REROUTE_ADVISORY,
                is_active=True,
                resolved_reason=None,
                assessed_at=datetime.now(timezone.utc),
            )
            await repo.save_trip_impact(impact)
            await session.commit()

            # Query by edge with matching organization
            results = await repo.list_trip_impacts_by_edge(edge_id, organization_id=org_id, active_only=True)
            assert any(t.id == impact.id for t in results)

            # Query by edge with non-matching organization
            different_org = uuid.uuid4()
            no_results = await repo.list_trip_impacts_by_edge(edge_id, organization_id=different_org, active_only=True)
            assert not any(t.id == impact.id for t in no_results)

            # Query by edge with bypass organization (e.g. None)
            all_results = await repo.list_trip_impacts_by_edge(edge_id, organization_id=None, active_only=True)
            assert any(t.id == impact.id for t in all_results)

            # Clean up test row
            await session.execute(text("DELETE FROM trip_impact_assessments WHERE id = :id"), {"id": impact.id})
            await session.commit()

    async def test_get_edge_impacts_endpoint_requires_view_impact(self) -> None:
        async with AsyncSessionLocal() as session:
            edge_res = await session.execute(text("SELECT id FROM road_edges LIMIT 1"))
            edge_id = edge_res.scalar_one()

        # Unauthenticated request -> 401
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.get(f"/api/v1/edges/{edge_id}/impacts")
            assert resp.status_code == 401

        # Authenticated as FIELD_OFFICER (lacks VIEW_IMPACT) -> 403
        fo_headers = {
            "X-Dev-User-Id": str(uuid.uuid4()),
            "X-Dev-Org-Id": str(uuid.uuid4()),
            "X-Dev-Role": Role.FIELD_OFFICER.value,
        }
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.get(f"/api/v1/edges/{edge_id}/impacts", headers=fo_headers)
            assert resp.status_code == 403

        # Authenticated as FLEET_MANAGER (holds VIEW_IMPACT) -> 200
        fm_headers = {
            "X-Dev-User-Id": str(uuid.uuid4()),
            "X-Dev-Org-Id": str(uuid.uuid4()),
            "X-Dev-Role": Role.FLEET_MANAGER.value,
        }
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.get(f"/api/v1/edges/{edge_id}/impacts", headers=fm_headers)
            assert resp.status_code == 200
            assert isinstance(resp.json(), list)
