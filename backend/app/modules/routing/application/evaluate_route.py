"""
app/modules/routing/application/evaluate_route.py — Deterministic Constrained Routing Use Case.
"""

from __future__ import annotations

from datetime import datetime, time, timedelta, timezone
from typing import Any
from uuid import UUID, uuid4

from app.modules.routing.application.ports import RoutingRepositoryPort
from app.modules.routing.domain.entities import (
    AlternativeRoute,
    RouteEdge,
    RoutePlan,
    VehicleConstraints,
    is_in_curfew,
)
from app.modules.routing.domain.enums import (
    PolicyVersion,
    RouteResultStatus,
)
from app.modules.routing.domain.exceptions import (
    CoordinateOutOfBoundsError,
    NodeNotFoundError,
)


class EvaluateRouteUseCase:
    def __init__(self, repository: RoutingRepositoryPort):
        self.repository = repository

    async def execute(
        self,
        organization_id: UUID,
        vehicle_constraints: VehicleConstraints,
        trip_id: UUID | None = None,
        origin_node_id: UUID | None = None,
        origin_coords: tuple[float, float] | None = None,  # (lon, lat)
        destination_node_id: UUID | None = None,
        destination_coords: tuple[float, float] | None = None,  # (lon, lat)
        policy_version: PolicyVersion = PolicyVersion.CONSERVATIVE_CRITICAL_V1,
    ) -> RoutePlan:
        # 1. Resolve Origin Node
        if origin_node_id is None:
            if origin_coords is None:
                raise NodeNotFoundError("Neither origin_node_id nor origin_coords provided")
            snap = await self.repository.snap_coordinates_to_node(origin_coords[0], origin_coords[1])
            if not snap:
                raise CoordinateOutOfBoundsError(f"Origin coordinates {origin_coords} out of network bounds")
            origin_node_id, source_index, _ = snap
        else:
            source_index = await self.repository.get_node_index(origin_node_id)
            if source_index is None:
                raise NodeNotFoundError(f"Origin node {origin_node_id} not found")

        # 2. Resolve Destination Node
        if destination_node_id is None:
            if destination_coords is None:
                raise NodeNotFoundError("Neither destination_node_id nor destination_coords provided")
            snap = await self.repository.snap_coordinates_to_node(destination_coords[0], destination_coords[1])
            if not snap:
                raise CoordinateOutOfBoundsError(f"Destination coordinates {destination_coords} out of network bounds")
            destination_node_id, target_index, _ = snap
        else:
            target_index = await self.repository.get_node_index(destination_node_id)
            if target_index is None:
                raise NodeNotFoundError(f"Destination node {destination_node_id} not found")

        # 3. Fetch Network Version & Status
        network_version_id, graph_version, status_version = await self.repository.get_active_network_version()

        # 4. Fetch Edge Constraints & Evaluate Hard Exclusions
        raw_edges = await self.repository.get_edge_constraints_and_metadata(network_version_id)

        admissible_edges = []
        excluded_reasons: dict[str, list[str]] = {}

        is_critical_cargo = vehicle_constraints.cargo_priority == "TIER_1_CRITICAL"

        for e in raw_edges:
            edge_id_str = str(e["id"])
            reasons = []

            # Hard Check 1: BLOCKED
            if e["status"] == "BLOCKED":
                reasons.append("ACCESSIBILITY_BLOCKED")

            # Hard Check 2: PROVISIONAL_CAUTION on critical cargo
            if e["status"] == "PROVISIONAL_CAUTION" and is_critical_cargo:
                reasons.append("PROVISIONAL_CAUTION_CRITICAL_CARGO")

            # Hard Check 3: Bridge weight / height limits
            for b in e.get("bridges", []):
                if b["max_weight_tonnes"] and (vehicle_constraints.max_weight_kg > b["max_weight_tonnes"] * 1000.0):
                    reasons.append(f"BRIDGE_WEIGHT_EXCEEDED_{b['max_weight_tonnes']}T")
                if b["max_height_meters"] and (vehicle_constraints.height_m > b["max_height_meters"]):
                    reasons.append(f"BRIDGE_HEIGHT_EXCEEDED_{b['max_height_meters']}M")

            # Hard Check 4: Hazmat & Curfew restrictions
            for r in e.get("restrictions", []):
                if r["kind"] == "NO_HAZMAT" and vehicle_constraints.is_hazmat:
                    reasons.append("HAZMAT_PROHIBITED")
                elif r["kind"] == "NIGHT_CURFEW":
                    # Assume night curfew 22:00 to 06:00 if not specified
                    curfew_start = time(22, 0)
                    curfew_end = time(6, 0)
                    if is_in_curfew(vehicle_constraints.departure_time, int(e["base_seconds"]), curfew_start, curfew_end):
                        reasons.append("NIGHT_CURFEW_IN_EFFECT")

            if reasons:
                excluded_reasons[edge_id_str] = reasons
                continue

            # Compute Dynamic Traversal Cost with Soft Penalties
            cost_multiplier = 1.0
            if e["status"] == "RESTRICTED":
                cost_multiplier *= 2.0
            elif e["status"] == "PROVISIONAL_CAUTION":
                cost_multiplier *= 1.5

            if e["surface_type"] == "UNPAVED":
                cost_multiplier *= 1.3
            elif e["surface_type"] == "GRAVEL":
                cost_multiplier *= 1.15

            if e["grade_percent"] and e["grade_percent"] > 8.0:
                cost_multiplier *= 1.2

            adjusted_cost = max(1.0, float(e["base_seconds"]) * cost_multiplier)
            adjusted_reverse = max(1.0, float(e["reverse_base_seconds"]) * cost_multiplier) if e["reverse_base_seconds"] else -1.0

            admissible_edges.append(
                f"SELECT {e['edge_index']} AS id, {e['source_index']} AS source, {e['target_index']} AS target, {adjusted_cost:.2f} AS cost, {adjusted_reverse:.2f} AS reverse_cost"
            )

        if not admissible_edges:
            # All edges excluded
            now = datetime.now(timezone.utc)
            plan = RoutePlan(
                id=uuid4(),
                organization_id=organization_id,
                trip_id=trip_id,
                network_version_id=network_version_id,
                graph_version=graph_version,
                status_version=status_version,
                policy_version=policy_version,
                origin_node_id=origin_node_id,
                destination_node_id=destination_node_id,
                result_status=RouteResultStatus.NO_FEASIBLE_PATH,
                total_distance_meters=0,
                total_duration_seconds=0,
                risk_penalty_score=0.0,
                requires_human_review=True,
                excluded_edge_reasons=excluded_reasons,
                primary_geometry=None,
                alternative_geometries=[],
                edges=[],
                alternatives=[],
                vehicle_id=vehicle_constraints.vehicle_id,
                vehicle_weight_kg=vehicle_constraints.max_weight_kg,
                vehicle_height_m=vehicle_constraints.height_m,
                is_hazmat=vehicle_constraints.is_hazmat,
                cargo_priority=vehicle_constraints.cargo_priority,
                departure_time=vehicle_constraints.departure_time,
                evaluated_at=now,
                expires_at=now + timedelta(hours=1),
            )
            await self.repository.save_route_plan(plan)
            return plan

        edge_subquery_sql = " UNION ALL ".join(admissible_edges)

        # 5. Execute Primary Dijkstra Route
        dijkstra_segments = await self.repository.execute_dijkstra(
            edge_subquery_sql=edge_subquery_sql,
            source_index=source_index,
            target_index=target_index,
        )

        now = datetime.now(timezone.utc)

        if not dijkstra_segments:
            plan = RoutePlan(
                id=uuid4(),
                organization_id=organization_id,
                trip_id=trip_id,
                network_version_id=network_version_id,
                graph_version=graph_version,
                status_version=status_version,
                policy_version=policy_version,
                origin_node_id=origin_node_id,
                destination_node_id=destination_node_id,
                result_status=RouteResultStatus.NO_FEASIBLE_PATH,
                total_distance_meters=0,
                total_duration_seconds=0,
                risk_penalty_score=0.0,
                requires_human_review=True,
                excluded_edge_reasons=excluded_reasons,
                primary_geometry=None,
                alternative_geometries=[],
                edges=[],
                alternatives=[],
                vehicle_id=vehicle_constraints.vehicle_id,
                vehicle_weight_kg=vehicle_constraints.max_weight_kg,
                vehicle_height_m=vehicle_constraints.height_m,
                is_hazmat=vehicle_constraints.is_hazmat,
                cargo_priority=vehicle_constraints.cargo_priority,
                departure_time=vehicle_constraints.departure_time,
                evaluated_at=now,
                expires_at=now + timedelta(hours=1),
            )
            await self.repository.save_route_plan(plan)
            return plan

        # Build primary RouteEdge list
        primary_edges: list[RouteEdge] = []
        cum_dist = 0
        cum_sec = 0
        primary_edge_ids: list[UUID] = []

        for seq, seg in enumerate(dijkstra_segments):
            cum_dist += int(seg["length_meters"])
            cum_sec += int(seg["cost"])
            edge_uuid = seg["edge_id"]
            primary_edge_ids.append(edge_uuid)
            primary_edges.append(
                RouteEdge(
                    edge_id=edge_uuid,
                    sequence_order=seq,
                    cumulative_distance_meters=cum_dist,
                    cumulative_duration_seconds=cum_sec,
                    is_alternative=False,
                    alternative_rank=0,
                )
            )

        # 6. Execute Yen's KSP for Alternative Routes (K=3)
        ksp_segments = await self.repository.execute_ksp(
            edge_subquery_sql=edge_subquery_sql,
            source_index=source_index,
            target_index=target_index,
            k=3,
        )

        # Group by path_id
        alt_paths_raw: dict[int, list[dict[str, Any]]] = {}
        for r in ksp_segments:
            alt_paths_raw.setdefault(r["path_id"], []).append(r)

        # Build alternatives (excluding path identical to primary)
        alternatives: list[AlternativeRoute] = []
        all_edge_ids_to_fetch = list(primary_edge_ids)

        alt_rank = 1
        for path_id, segs in alt_paths_raw.items():
            path_edge_ids = [s["edge_id"] for s in segs]
            if path_edge_ids == primary_edge_ids:
                continue  # Skip path that duplicates primary

            alt_edges: list[RouteEdge] = []
            a_cum_dist = 0
            a_cum_sec = 0
            for seq, seg in enumerate(segs):
                a_cum_dist += int(seg["length_meters"])
                a_cum_sec += int(seg["cost"])
                e_id = seg["edge_id"]
                all_edge_ids_to_fetch.append(e_id)
                alt_edges.append(
                    RouteEdge(
                        edge_id=e_id,
                        sequence_order=seq,
                        cumulative_distance_meters=a_cum_dist,
                        cumulative_duration_seconds=a_cum_sec,
                        is_alternative=True,
                        alternative_rank=alt_rank,
                    )
                )

            alternatives.append(
                AlternativeRoute(
                    rank=alt_rank,
                    edges=alt_edges,
                    total_distance_meters=a_cum_dist,
                    total_duration_seconds=a_cum_sec,
                    risk_penalty_score=0.0,
                    geometry_geojson={},  # Will be populated below
                )
            )
            alt_rank += 1

        # 7. Construct Geometries for Primary and Alternatives
        edge_geoms = await self.repository.get_edges_geometries(list(set(all_edge_ids_to_fetch)))

        def build_linestring(edge_ids: list[UUID]) -> dict[str, Any]:
            all_coords = []
            for eid in edge_ids:
                geom = edge_geoms.get(eid)
                if geom and geom.get("type") == "LineString":
                    coords = geom.get("coordinates", [])
                    if all_coords and coords and all_coords[-1] == coords[0]:
                        all_coords.extend(coords[1:])
                    else:
                        all_coords.extend(coords)
            return {"type": "LineString", "coordinates": all_coords}

        primary_geom = build_linestring(primary_edge_ids)

        alt_geometries = []
        populated_alts = []
        for alt in alternatives:
            alt_geom = build_linestring([e.edge_id for e in alt.edges])
            alt_geometries.append(alt_geom)
            populated_alts.append(
                AlternativeRoute(
                    rank=alt.rank,
                    edges=alt.edges,
                    total_distance_meters=alt.total_distance_meters,
                    total_duration_seconds=alt.total_duration_seconds,
                    risk_penalty_score=alt.risk_penalty_score,
                    geometry_geojson=alt_geom,
                )
            )

        # 8. Create & Persist RoutePlan Snapshot
        plan = RoutePlan(
            id=uuid4(),
            organization_id=organization_id,
            trip_id=trip_id,
            network_version_id=network_version_id,
            graph_version=graph_version,
            status_version=status_version,
            policy_version=policy_version,
            origin_node_id=origin_node_id,
            destination_node_id=destination_node_id,
            result_status=RouteResultStatus.FEASIBLE,
            total_distance_meters=cum_dist,
            total_duration_seconds=cum_sec,
            risk_penalty_score=0.0,
            requires_human_review=False,
            excluded_edge_reasons=excluded_reasons,
            primary_geometry=primary_geom,
            alternative_geometries=alt_geometries,
            edges=primary_edges,
            alternatives=populated_alts,
            vehicle_id=vehicle_constraints.vehicle_id,
            vehicle_weight_kg=vehicle_constraints.max_weight_kg,
            vehicle_height_m=vehicle_constraints.height_m,
            is_hazmat=vehicle_constraints.is_hazmat,
            cargo_priority=vehicle_constraints.cargo_priority,
            departure_time=vehicle_constraints.departure_time,
            evaluated_at=now,
            expires_at=now + timedelta(hours=1),
        )
        await self.repository.save_route_plan(plan)
        return plan
