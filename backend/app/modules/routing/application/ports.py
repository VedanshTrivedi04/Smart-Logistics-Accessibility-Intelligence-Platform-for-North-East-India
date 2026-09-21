"""
app/modules/routing/application/ports.py — Repository and Service Ports for Routing.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Any
from uuid import UUID

from app.modules.routing.domain.entities import DispatchDecision, RoutePlan


class RoutingRepositoryPort(ABC):
    @abstractmethod
    async def get_active_network_version(self) -> tuple[UUID, str, int]:
        """Returns (network_version_id, graph_version_code, status_version)."""

    @abstractmethod
    async def snap_coordinates_to_node(
        self,
        lon: float,
        lat: float,
        max_distance_m: float = 5000.0,
    ) -> tuple[UUID, int, float] | None:
        """Snaps coordinate to nearest road_node. Returns (node_id, node_index, distance_meters)."""

    @abstractmethod
    async def get_node_index(self, node_id: UUID) -> int | None:
        """Returns node_index for node_id."""

    @abstractmethod
    async def get_edge_constraints_and_metadata(
        self,
        network_version_id: UUID,
    ) -> list[dict[str, Any]]:
        """
        Fetches all road edges with bridges, restrictions, surface type, grade, and current status
        for building dynamic graph costs and hard exclusion filters.
        """

    @abstractmethod
    async def execute_dijkstra(
        self,
        edge_subquery_sql: str,
        source_index: int,
        target_index: int,
    ) -> list[dict[str, Any]]:
        """Executes pgr_dijkstra on the filtered edge subquery."""

    @abstractmethod
    async def execute_ksp(
        self,
        edge_subquery_sql: str,
        source_index: int,
        target_index: int,
        k: int = 3,
    ) -> list[dict[str, Any]]:
        """Executes pgr_ksp (Yen's K-shortest loopless paths) on the filtered edge subquery."""

    @abstractmethod
    async def get_edges_geometries(self, edge_ids: list[UUID]) -> dict[UUID, dict[str, Any]]:
        """Returns map of edge_id -> GeoJSON LineString geometry."""

    @abstractmethod
    async def save_route_plan(self, plan: RoutePlan) -> None:
        """Persists immutable route plan snapshot and its edges."""

    @abstractmethod
    async def get_route_plan_by_id(self, route_plan_id: UUID) -> RoutePlan | None:
        """Fetches route plan snapshot by ID."""

    @abstractmethod
    async def save_dispatch_decision(self, decision: DispatchDecision) -> None:
        """Persists human dispatch decision and links to trip."""
