"""
tests/integration/network/test_bbox_query.py — Integration tests for spatial bounding box edge queries.
"""

from __future__ import annotations

import pytest

from app.core.db import AsyncSessionLocal
from app.modules.network.application.query_network import QueryBoundedEdgesUseCase
from app.modules.network.infrastructure.repository import SqlAlchemyNetworkRepository


class TestBBoxSpatialQueries:
    async def test_bounded_edges_returns_pilot_corridor(self) -> None:
        async with AsyncSessionLocal() as session:
            repo = SqlAlchemyNetworkRepository(session)
            use_case = QueryBoundedEdgesUseCase(repo)

            # Bounding box encompassing Assam-Meghalaya pilot corridor
            res = await use_case.execute(
                min_lon=91.0,
                min_lat=25.0,
                max_lon=92.5,
                max_lat=26.5,
                zoom=14,
            )

            assert res["type"] == "FeatureCollection"
            features = res["features"]
            assert len(features) >= 10, "Should return corridor features in bbox"

            first = features[0]
            assert first["type"] == "Feature"
            assert "geometry" in first
            assert first["geometry"]["type"] == "LineString"
            assert "accessibility_status" in first["properties"]

    async def test_disjoint_bbox_returns_empty(self) -> None:
        async with AsyncSessionLocal() as session:
            repo = SqlAlchemyNetworkRepository(session)
            use_case = QueryBoundedEdgesUseCase(repo)

            # Bounding box in Rajasthan (far away from North-East India)
            res = await use_case.execute(
                min_lon=70.0,
                min_lat=26.0,
                max_lon=71.0,
                max_lat=27.0,
            )

            assert res["type"] == "FeatureCollection"
            assert len(res["features"]) == 0
