"""
app/modules/network/application/import_network.py — Use case for importing and validating road network snapshots.
"""

from __future__ import annotations

from uuid import UUID

from app.modules.network.application.ports import NetworkRepositoryPort
from app.modules.network.domain.entities import (
    Bridge,
    EdgeRestriction,
    NetworkVersion,
    RoadEdge,
    RoadNode,
)
from app.modules.network.domain.exceptions import InvalidTopologyError


class ImportNetworkVersionUseCase:
    """Validates topological consistency and persists a network graph version."""

    def __init__(self, network_repo: NetworkRepositoryPort) -> None:
        self.network_repo = network_repo

    async def execute(
        self,
        version: NetworkVersion,
        nodes: list[RoadNode],
        edges: list[RoadEdge],
        bridges: list[Bridge] | None = None,
        bridge_edge_pairs: list[tuple[UUID, UUID]] | None = None,
        restrictions: list[EdgeRestriction] | None = None,
    ) -> NetworkVersion:
        # 1. Validate nodes
        node_indices = {n.node_index for n in nodes}
        node_ids = {n.id for n in nodes}
        if len(node_indices) != len(nodes):
            raise InvalidTopologyError("Duplicate node_index found in node set")

        # 2. Validate edges
        edge_indices = set()
        connected_node_indices = set()

        for edge in edges:
            if edge.edge_index in edge_indices:
                raise InvalidTopologyError(f"Duplicate edge_index: {edge.edge_index}")
            edge_indices.add(edge.edge_index)

            if edge.source_index not in node_indices:
                raise InvalidTopologyError(f"Edge {edge.edge_index} refers to missing source node {edge.source_index}")
            if edge.target_index not in node_indices:
                raise InvalidTopologyError(f"Edge {edge.edge_index} refers to missing target node {edge.target_index}")

            if edge.source_node_id not in node_ids or edge.target_node_id not in node_ids:
                raise InvalidTopologyError(f"Edge {edge.id} refers to missing node UUID")

            if edge.base_seconds <= 0:
                raise InvalidTopologyError(f"Edge {edge.edge_index} has non-positive traversal cost: {edge.base_seconds}")

            connected_node_indices.add(edge.source_index)
            connected_node_indices.add(edge.target_index)

        # 3. Persist graph via repository port
        await self.network_repo.save_network_version(
            version=version,
            nodes=nodes,
            edges=edges,
            bridges=bridges,
            bridge_edge_pairs=bridge_edge_pairs,
            restrictions=restrictions,
        )

        return version
