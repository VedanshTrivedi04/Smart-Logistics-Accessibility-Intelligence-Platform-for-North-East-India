"""
tests/integration/network/test_topology_pgrouting.py — Integration tests for pgRouting Dijkstra graph execution.
"""

from __future__ import annotations

import pytest
from sqlalchemy import text

from app.core.db import AsyncSessionLocal
from app.modules.network.infrastructure.repository import SqlAlchemyNetworkRepository


class TestPgRoutingTopology:
    async def test_dijkstra_finds_path_on_pilot_corridor(self) -> None:
        """Verifies pgr_dijkstra executes on live Neon PostgreSQL and returns path."""
        async with AsyncSessionLocal() as session:
            repo = SqlAlchemyNetworkRepository(session)

            # Node 1 = Amingaon, Node 13 = Shillong Police Bazar
            path = await repo.calculate_dijkstra_path(source_index=1, target_index=13, exclude_blocked=False)

            assert len(path) > 0, "pgRouting should find a valid path between Node 1 and Node 13"
            total_time = sum(p["cost"] for p in path)
            assert total_time > 0.0

            # First step source should be 1
            assert path[0]["node_index"] == 1

    async def test_dijkstra_dynamically_excludes_blocked_edges(self) -> None:
        """Verifies that an edge with status = 'BLOCKED' is excluded from Dijkstra search."""
        async with AsyncSessionLocal() as session:
            repo = SqlAlchemyNetworkRepository(session)

            # 1. First find normal path
            normal_path = await repo.calculate_dijkstra_path(source_index=1, target_index=13, exclude_blocked=True)
            assert len(normal_path) > 0

            # 2. Mark the critical choke point (Edge 110: Umiam Dam Overpass) as BLOCKED
            await session.execute(
                text("""
                    UPDATE edge_status_current
                    SET status = 'BLOCKED', freshness = 'FRESH'
                    WHERE edge_id IN (SELECT id FROM road_edges WHERE edge_index = 110)
                """)
            )
            await session.commit()

            # 3. Re-calculate path with exclude_blocked=True
            rerouted_path = await repo.calculate_dijkstra_path(source_index=1, target_index=13, exclude_blocked=True)

            # The path should still exist via the Western Bypass (Nongstoin / NH-217 / NH-106)
            # but none of the edges should be 110!
            blocked_edge_indices = [p["edge_index"] for p in rerouted_path]
            assert 110 not in blocked_edge_indices, "Blocked edge 110 must NOT appear in routed path"

            # 4. Clean up: restore edge 110 to OPEN
            await session.execute(
                text("""
                    UPDATE edge_status_current
                    SET status = 'OPEN', freshness = 'FRESH'
                    WHERE edge_id IN (SELECT id FROM road_edges WHERE edge_index = 110)
                """)
            )
            await session.commit()
