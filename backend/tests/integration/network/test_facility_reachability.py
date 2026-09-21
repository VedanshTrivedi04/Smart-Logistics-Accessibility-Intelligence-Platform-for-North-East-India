"""
tests/integration/network/test_facility_reachability.py — Integration tests for facility reachability analysis.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone

import pytest
from sqlalchemy import text

from app.core.db import AsyncSessionLocal
from app.modules.network.application.evaluate_reachability import (
    EvaluateFacilityReachabilityUseCase,
)
from app.modules.network.domain.entities import Facility
from app.modules.network.domain.enums import FacilityKind, ReachabilityStatus
from app.modules.network.domain.exceptions import FacilityNotFoundError
from app.modules.network.infrastructure.repository import SqlAlchemyNetworkRepository


class TestFacilityReachability:
    async def test_reachability_normal_corridor_returns_reachable(self) -> None:
        async with AsyncSessionLocal() as session:
            repo = SqlAlchemyNetworkRepository(session)
            use_case = EvaluateFacilityReachabilityUseCase(network_repo=repo, edge_status_repo=repo)

            # Find NEIGRIHMS Hospital
            res = await session.execute(
                text("SELECT id FROM facilities WHERE code = 'FAC-SHL-HOSP-01' LIMIT 1")
            )
            row = res.first()
            if not row:
                pytest.skip("NEIGRIHMS facility not found")

            facility_id = row[0]
            result = await use_case.execute(facility_id=facility_id, required_weight_tonnes=16.0)

            assert result["status"] in (ReachabilityStatus.REACHABLE.value, ReachabilityStatus.RESTRICTED_REACHABLE.value)
            assert result["total_seconds"] is not None
            assert result["total_seconds"] > 0.0

    async def test_unsnapped_facility_returns_insufficient_data(self) -> None:
        """Systemdesign.md line 126: Distinguish coverage gap from no path."""
        async with AsyncSessionLocal() as session:
            repo = SqlAlchemyNetworkRepository(session)
            use_case = EvaluateFacilityReachabilityUseCase(network_repo=repo, edge_status_repo=repo)

            # Create an unsnapped remote facility (snap_distance_m > 2000m)
            dummy_id = uuid.uuid4()
            remote_facility = Facility(
                id=dummy_id,
                code=f"FAC-REMOTE-{dummy_id.hex[:8]}",
                name="Remote Arunachal Foothill Health Center",
                kind=FacilityKind.HOSPITAL,
                jurisdiction_id=uuid.UUID("00000002-0000-4000-8000-000000000001"),
                lon=93.5,
                lat=27.5,
                nearest_road_node_id=None,
                snap_distance_m=5000.0,  # 5 km > 2km tolerance
            )
            await repo.save_facilities([remote_facility])
            await session.commit()

            result = await use_case.execute(facility_id=dummy_id)
            assert result["status"] == ReachabilityStatus.INSUFFICIENT_DATA.value
            assert "snap tolerance" in result["reason"].lower()

    async def test_all_paths_blocked_returns_no_feasible_path(self) -> None:
        async with AsyncSessionLocal() as session:
            repo = SqlAlchemyNetworkRepository(session)
            use_case = EvaluateFacilityReachabilityUseCase(network_repo=repo, edge_status_repo=repo)

            res = await session.execute(
                text("SELECT id FROM facilities WHERE code = 'FAC-SHL-HOSP-01' LIMIT 1")
            )
            row = res.first()
            if not row:
                pytest.skip("NEIGRIHMS facility not found")

            facility_id = row[0]

            # Block the only ingress edges to NEIGRIHMS (Edge 113 and Shillong West 206)
            await session.execute(
                text("""
                    UPDATE edge_status_current
                    SET status = 'BLOCKED', freshness = 'FRESH'
                    WHERE edge_id IN (SELECT id FROM road_edges WHERE edge_index IN (113, 206))
                """)
            )
            await session.commit()

            result = await use_case.execute(facility_id=facility_id)
            assert result["status"] == ReachabilityStatus.NO_FEASIBLE_PATH.value

            # Restore edges to OPEN
            await session.execute(
                text("""
                    UPDATE edge_status_current
                    SET status = 'OPEN', freshness = 'FRESH'
                    WHERE edge_id IN (SELECT id FROM road_edges WHERE edge_index IN (113, 206))
                """)
            )
            await session.commit()
