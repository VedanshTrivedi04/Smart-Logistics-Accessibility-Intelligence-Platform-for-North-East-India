"""
app/modules/network/application/evaluate_reachability.py — Use case for calculating emergency facility reachability.
"""

from __future__ import annotations

from typing import Any
from uuid import UUID

from app.modules.network.application.ports import (
    EdgeStatusRepositoryPort,
    NetworkRepositoryPort,
)
from app.modules.network.domain.enums import FacilityKind, ReachabilityStatus
from app.modules.network.domain.exceptions import FacilityNotFoundError


class EvaluateFacilityReachabilityUseCase:
    """
    Evaluates emergency supply reachability to an enrolled facility.
    Systemdesign.md line 126: Distinguishes coverage gap (INSUFFICIENT_DATA) from no path (NO_FEASIBLE_PATH).
    """

    def __init__(
        self,
        network_repo: NetworkRepositoryPort,
        edge_status_repo: EdgeStatusRepositoryPort,
    ) -> None:
        self.network_repo = network_repo
        self.edge_status_repo = edge_status_repo

    async def execute(
        self,
        facility_id: UUID,
        required_weight_tonnes: float = 16.0,
    ) -> dict[str, Any]:
        # 1. Fetch target facility
        facility = await self.network_repo.get_facility_by_id(facility_id)
        if not facility:
            raise FacilityNotFoundError(f"Facility {facility_id} not found")

        # 2. Coverage Gap Check (Snap tolerance <= 2,000m)
        if facility.nearest_road_node_id is None or (facility.snap_distance_m and facility.snap_distance_m > 2000.0):
            return {
                "facility_id": str(facility.id),
                "facility_name": facility.name,
                "status": ReachabilityStatus.INSUFFICIENT_DATA.value,
                "reason": "Facility point exceeds road network snap tolerance (> 2,000m) or is unmapped",
                "nearest_node_id": None,
                "snap_distance_m": facility.snap_distance_m,
                "path": None,
            }

        target_node = await self.network_repo.get_node_by_id(facility.nearest_road_node_id)
        if not target_node:
            return {
                "facility_id": str(facility.id),
                "facility_name": facility.name,
                "status": ReachabilityStatus.INSUFFICIENT_DATA.value,
                "reason": "Topological anchor node not found in active graph version",
                "nearest_node_id": str(facility.nearest_road_node_id),
                "snap_distance_m": facility.snap_distance_m,
                "path": None,
            }

        # 3. Locate potential supply hubs (Oxygen plants, logistics hubs)
        all_facilities = await self.network_repo.get_facilities(limit=100)
        hubs = [
            f for f in all_facilities
            if f.kind in (FacilityKind.LOGISTICS_HUB, FacilityKind.OXYGEN_PLANT)
            and f.nearest_road_node_id is not None
            and f.id != facility.id
        ]

        if not hubs:
            return {
                "facility_id": str(facility.id),
                "facility_name": facility.name,
                "status": ReachabilityStatus.INSUFFICIENT_DATA.value,
                "reason": "No enrolled logistics hubs or oxygen plants found in regional network",
                "nearest_node_id": str(target_node.id),
                "snap_distance_m": facility.snap_distance_m,
                "path": None,
            }

        # 4. Attempt pgRouting Dijkstra from each hub (excluding BLOCKED edges)
        best_path: list[dict[str, Any]] | None = None
        best_hub = None
        min_cost = float("inf")

        for hub in hubs:
            hub_node = await self.network_repo.get_node_by_id(hub.nearest_road_node_id)
            if not hub_node:
                continue

            path_segments = await self.network_repo.calculate_dijkstra_path(
                source_index=hub_node.node_index,
                target_index=target_node.node_index,
                exclude_blocked=True,
            )

            if path_segments:
                total_cost = sum(seg.get("cost", 0.0) for seg in path_segments)
                if total_cost < min_cost:
                    min_cost = total_cost
                    best_path = path_segments
                    best_hub = hub

        # 5. Check if no feasible path exists
        if not best_path or best_hub is None:
            return {
                "facility_id": str(facility.id),
                "facility_name": facility.name,
                "status": ReachabilityStatus.NO_FEASIBLE_PATH.value,
                "reason": "All connecting corridors disconnected by verified road closures or severe hazards",
                "nearest_node_id": str(target_node.id),
                "snap_distance_m": facility.snap_distance_m,
                "path": None,
            }

        # 6. Evaluate bridge & restriction bottlenecks along the best path
        has_bottleneck = False
        bottlenecks = []

        for seg in best_path:
            edge_id_val = seg.get("edge_id")
            if not edge_id_val:
                continue

            edge = await self.network_repo.get_edge_by_id(edge_id_val)
            if edge:
                restrictions = await self.network_repo.get_edge_restrictions(edge.id)
                for r in restrictions:
                    if r.kind.value == "MAX_WEIGHT" and r.value_numeric is not None:
                        if required_weight_tonnes > r.value_numeric:
                            has_bottleneck = True
                            bottlenecks.append({
                                "edge_id": str(edge.id),
                                "road_name": edge.road_name,
                                "restriction": f"Max weight {r.value_numeric}t < required {required_weight_tonnes}t",
                            })

        if has_bottleneck:
            return {
                "facility_id": str(facility.id),
                "facility_name": facility.name,
                "status": ReachabilityStatus.RESTRICTED_REACHABLE.value,
                "reason": "Path exists but contains weight/height bottlenecks requiring specialized convoys or detours",
                "origin_hub_id": str(best_hub.id),
                "origin_hub_name": best_hub.name,
                "total_seconds": min_cost,
                "edge_count": len(best_path),
                "bottlenecks": bottlenecks,
                "path": best_path,
            }

        return {
            "facility_id": str(facility.id),
            "facility_name": facility.name,
            "status": ReachabilityStatus.REACHABLE.value,
            "reason": "Corridor fully traversable with current active road conditions",
            "origin_hub_id": str(best_hub.id),
            "origin_hub_name": best_hub.name,
            "total_seconds": min_cost,
            "edge_count": len(best_path),
            "bottlenecks": [],
            "path": best_path,
        }
