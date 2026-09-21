"""
app/modules/network/application/ports.py — Abstract Ports for Network & GIS Module.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Any
from uuid import UUID

from app.modules.network.domain.entities import (
    Bridge,
    EdgeRestriction,
    EdgeStatusCurrent,
    EdgeStatusEvent,
    Facility,
    NetworkVersion,
    RoadEdge,
    RoadNode,
)
from app.modules.network.domain.enums import FacilityKind


class NetworkRepositoryPort(ABC):
    """Abstract port for topological road network, spatial querying & pgRouting."""

    @abstractmethod
    async def get_active_version(self) -> NetworkVersion | None:
        """Fetch currently active network graph version."""

    @abstractmethod
    async def get_version_by_code(self, code: str) -> NetworkVersion | None:
        """Fetch version by code identifier."""

    @abstractmethod
    async def save_network_version(
        self,
        version: NetworkVersion,
        nodes: list[RoadNode],
        edges: list[RoadEdge],
        bridges: list[Bridge] | None = None,
        bridge_edge_pairs: list[tuple[UUID, UUID]] | None = None,
        restrictions: list[EdgeRestriction] | None = None,
    ) -> None:
        """Persist full versioned road network graph."""

    @abstractmethod
    async def get_edge_by_id(self, edge_id: UUID) -> RoadEdge | None:
        """Fetch edge by UUID."""

    @abstractmethod
    async def get_node_by_id(self, node_id: UUID) -> RoadNode | None:
        """Fetch node by UUID."""

    @abstractmethod
    async def get_edge_restrictions(self, edge_id: UUID) -> list[EdgeRestriction]:
        """Fetch all restrictions for an edge."""

    @abstractmethod
    async def get_bounded_edges(
        self,
        min_lon: float,
        min_lat: float,
        max_lon: float,
        max_lat: float,
        simplify_tolerance: float | None = None,
        limit: int = 5000,
    ) -> list[tuple[RoadEdge, EdgeStatusCurrent | None]]:
        """Query road edges within bounding box joined with live current status."""

    @abstractmethod
    async def snap_point_to_node(
        self,
        lon: float,
        lat: float,
        max_distance_m: float = 2000.0,
    ) -> tuple[RoadNode, float] | None:
        """Find nearest topological node within max distance in meters."""

    @abstractmethod
    async def get_facilities(
        self,
        jurisdiction_id: UUID | None = None,
        kind: FacilityKind | None = None,
        is_critical: bool | None = None,
        limit: int = 50,
    ) -> list[Facility]:
        """List enrolled facilities with filters."""

    @abstractmethod
    async def get_facility_by_id(self, facility_id: UUID) -> Facility | None:
        """Fetch enrolled facility by ID."""

    @abstractmethod
    async def save_facilities(self, facilities: list[Facility]) -> None:
        """Persist enrolled facilities."""

    @abstractmethod
    async def calculate_dijkstra_path(
        self,
        source_index: int,
        target_index: int,
        exclude_blocked: bool = True,
    ) -> list[dict[str, Any]]:
        """
        Execute pgRouting pgr_dijkstra over active network graph.
        Returns list of path segments: [{'seq': ..., 'node': ..., 'edge': ..., 'cost': ...}, ...]
        """


class EdgeStatusRepositoryPort(ABC):
    """Abstract port for append-only edge status events & materialized projections."""

    @abstractmethod
    async def get_current_status(self, edge_id: UUID) -> EdgeStatusCurrent | None:
        """Fetch current materialized accessibility status for an edge."""

    @abstractmethod
    async def get_current_statuses(self, edge_ids: list[UUID]) -> dict[UUID, EdgeStatusCurrent]:
        """Fetch current statuses for multiple edges."""

    @abstractmethod
    async def append_status_event_and_update_current(
        self,
        event: EdgeStatusEvent,
        current: EdgeStatusCurrent,
    ) -> None:
        """Atomically record event to event store and update live projection."""

    @abstractmethod
    async def get_status_history(self, edge_id: UUID, limit: int = 50) -> list[EdgeStatusEvent]:
        """Fetch historical status events for an edge."""

    @abstractmethod
    async def get_global_status_version(self) -> int:
        """Fetch current global monotonic network status version."""

