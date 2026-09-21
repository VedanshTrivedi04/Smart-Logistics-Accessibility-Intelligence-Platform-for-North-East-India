"""
tests/unit/network/test_network_domain.py — Unit Tests for Network Domain Entities and Import Topology Validation.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from unittest.mock import AsyncMock

import pytest

from app.modules.network.application.import_network import ImportNetworkVersionUseCase
from app.modules.network.domain.entities import NetworkVersion, RoadEdge, RoadNode
from app.modules.network.domain.enums import RoadClass, SurfaceType
from app.modules.network.domain.exceptions import InvalidTopologyError


def make_test_node(node_index: int, version_id: uuid.UUID) -> RoadNode:
    return RoadNode(
        id=uuid.uuid4(),
        network_version_id=version_id,
        node_index=node_index,
        lon=91.7 + (node_index * 0.01),
        lat=26.1 + (node_index * 0.01),
    )


class TestNetworkDomainAndImport:
    def test_road_edge_is_one_way_property(self) -> None:
        v_id = uuid.uuid4()
        n1 = make_test_node(1, v_id)
        n2 = make_test_node(2, v_id)

        two_way = RoadEdge(
            id=uuid.uuid4(),
            network_version_id=v_id,
            edge_index=1,
            source_node_id=n1.id,
            target_node_id=n2.id,
            source_index=1,
            target_index=2,
            coordinates=[(91.7, 26.1), (91.8, 26.2)],
            length_meters=1000.0,
            road_class=RoadClass.NATIONAL_HIGHWAY,
            surface_type=SurfaceType.PAVED_ASPHALT,
            speed_limit_kmh=60,
            base_seconds=60.0,
            reverse_base_seconds=60.0,
        )
        assert two_way.is_one_way is False

        one_way = RoadEdge(
            id=uuid.uuid4(),
            network_version_id=v_id,
            edge_index=2,
            source_node_id=n1.id,
            target_node_id=n2.id,
            source_index=1,
            target_index=2,
            coordinates=[(91.7, 26.1), (91.8, 26.2)],
            length_meters=1000.0,
            road_class=RoadClass.NATIONAL_HIGHWAY,
            surface_type=SurfaceType.PAVED_ASPHALT,
            speed_limit_kmh=60,
            base_seconds=60.0,
            reverse_base_seconds=-1.0,
        )
        assert one_way.is_one_way is True

    def test_entities_are_immutable(self) -> None:
        v_id = uuid.uuid4()
        node = make_test_node(1, v_id)
        with pytest.raises(AttributeError):
            node.node_index = 99  # type: ignore

    async def test_import_detects_duplicate_node_index(self) -> None:
        v_id = uuid.uuid4()
        n1 = make_test_node(1, v_id)
        n2 = make_test_node(1, v_id)  # Duplicate node_index

        repo = AsyncMock()
        use_case = ImportNetworkVersionUseCase(repo)
        version = NetworkVersion(id=v_id, code="v1", name="v1", status="ACTIVE", built_at=datetime.now(timezone.utc))

        with pytest.raises(InvalidTopologyError) as exc_info:
            await use_case.execute(version, [n1, n2], [])
        assert "duplicate node_index" in str(exc_info.value).lower()

    async def test_import_detects_missing_target_node(self) -> None:
        v_id = uuid.uuid4()
        n1 = make_test_node(1, v_id)
        edge = RoadEdge(
            id=uuid.uuid4(),
            network_version_id=v_id,
            edge_index=1,
            source_node_id=n1.id,
            target_node_id=uuid.uuid4(),
            source_index=1,
            target_index=99,  # Node 99 does not exist
            coordinates=[(91.7, 26.1), (91.8, 26.2)],
            length_meters=1000.0,
            road_class=RoadClass.NATIONAL_HIGHWAY,
            surface_type=SurfaceType.PAVED_ASPHALT,
            speed_limit_kmh=60,
            base_seconds=60.0,
            reverse_base_seconds=60.0,
        )

        repo = AsyncMock()
        use_case = ImportNetworkVersionUseCase(repo)
        version = NetworkVersion(id=v_id, code="v1", name="v1", status="ACTIVE", built_at=datetime.now(timezone.utc))

        with pytest.raises(InvalidTopologyError) as exc_info:
            await use_case.execute(version, [n1], [edge])
        assert "missing target node" in str(exc_info.value).lower()

    async def test_import_detects_non_positive_cost(self) -> None:
        v_id = uuid.uuid4()
        n1 = make_test_node(1, v_id)
        n2 = make_test_node(2, v_id)
        edge = RoadEdge(
            id=uuid.uuid4(),
            network_version_id=v_id,
            edge_index=1,
            source_node_id=n1.id,
            target_node_id=n2.id,
            source_index=1,
            target_index=2,
            coordinates=[(91.7, 26.1), (91.8, 26.2)],
            length_meters=1000.0,
            road_class=RoadClass.NATIONAL_HIGHWAY,
            surface_type=SurfaceType.PAVED_ASPHALT,
            speed_limit_kmh=60,
            base_seconds=0.0,  # Illegal zero cost
            reverse_base_seconds=60.0,
        )

        repo = AsyncMock()
        use_case = ImportNetworkVersionUseCase(repo)
        version = NetworkVersion(id=v_id, code="v1", name="v1", status="ACTIVE", built_at=datetime.now(timezone.utc))

        with pytest.raises(InvalidTopologyError) as exc_info:
            await use_case.execute(version, [n1, n2], [edge])
        assert "non-positive traversal cost" in str(exc_info.value).lower()
