"""
app/modules/routing/infrastructure/repository.py — SQLAlchemy & pgRouting Repository for Routing.
"""

from __future__ import annotations

import json
from typing import Any
from uuid import UUID

from geoalchemy2 import Geography
from geoalchemy2.functions import ST_AsGeoJSON, ST_Distance, ST_DWithin, ST_GeomFromText
import sqlalchemy as sa
from sqlalchemy import func, select, text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.logistics.infrastructure.models import TripModel
from app.modules.network.infrastructure.models import (
    BridgeEdgeModel,
    BridgeModel,
    EdgeRestrictionModel,
    EdgeStatusCurrentModel,
    NetworkVersionModel,
    RoadEdgeModel,
    RoadNodeModel,
)
from app.modules.routing.application.ports import RoutingRepositoryPort
from app.modules.routing.domain.entities import (
    AlternativeRoute,
    DispatchDecision,
    RouteEdge,
    RoutePlan,
)
from app.modules.routing.domain.enums import (
    DispatchAction,
    PolicyVersion,
    RouteResultStatus,
)
from app.modules.routing.infrastructure.models import (
    DispatchDecisionModel,
    RoutePlanEdgeModel,
    RoutePlanModel,
)


class SqlAlchemyRoutingRepository(RoutingRepositoryPort):
    def __init__(self, session: AsyncSession):
        self.session = session

    async def get_active_network_version(self) -> tuple[UUID, str, int]:
        stmt = (
            select(NetworkVersionModel.id, NetworkVersionModel.code, NetworkVersionModel.status_version)
            .where(NetworkVersionModel.status == "ACTIVE")
            .order_by(NetworkVersionModel.built_at.desc())
            .limit(1)
        )
        res = await self.session.execute(stmt)
        row = res.first()
        if not row:
            raise RuntimeError("No active network version found in database")
        return row[0], row[1], row[2]

    async def snap_coordinates_to_node(
        self,
        lon: float,
        lat: float,
        max_distance_m: float = 25000.0,
    ) -> tuple[UUID, int, float] | None:
        point_geom = func.ST_SetSRID(func.ST_MakePoint(lon, lat), 4326)
        dist_expr = func.ST_Distance(
            RoadNodeModel.geom.cast(Geography),
            point_geom.cast(Geography),
        ).label("dist_m")

        stmt = (
            select(RoadNodeModel.id, RoadNodeModel.node_index, dist_expr)
            .where(func.ST_DWithin(RoadNodeModel.geom.cast(Geography), point_geom.cast(Geography), max_distance_m))
            .order_by(dist_expr.asc())
            .limit(1)
        )
        res = await self.session.execute(stmt)
        row = res.first()
        if not row:
            return None
        return row[0], row[1], float(row[2])

    async def get_node_index(self, node_id: UUID) -> int | None:
        stmt = select(RoadNodeModel.node_index).where(RoadNodeModel.id == node_id)
        res = await self.session.execute(stmt)
        return res.scalar_one_or_none()

    async def get_edge_constraints_and_metadata(
        self,
        network_version_id: UUID,
    ) -> list[dict[str, Any]]:
        stmt = (
            select(
                RoadEdgeModel.id,
                RoadEdgeModel.edge_index,
                RoadEdgeModel.source_index,
                RoadEdgeModel.target_index,
                RoadEdgeModel.base_seconds,
                RoadEdgeModel.reverse_base_seconds,
                RoadEdgeModel.length_meters,
                RoadEdgeModel.surface_type,
                RoadEdgeModel.gradient_percent,
                RoadEdgeModel.road_name,
                EdgeStatusCurrentModel.status,
                EdgeStatusCurrentModel.freshness,
            )
            .outerjoin(EdgeStatusCurrentModel, EdgeStatusCurrentModel.edge_id == RoadEdgeModel.id)
            .where(RoadEdgeModel.network_version_id == network_version_id)
        )
        res = await self.session.execute(stmt)
        edges = []
        for r in res.all():
            edges.append({
                "id": r[0],
                "edge_index": r[1],
                "source_index": r[2],
                "target_index": r[3],
                "base_seconds": r[4],
                "reverse_base_seconds": r[5],
                "length_meters": r[6],
                "surface_type": r[7],
                "grade_percent": r[8],
                "road_name": r[9],
                "status": r[10],
                "freshness": r[11],
            })

        # Fetch bridges mapped to edges
        b_stmt = (
            select(
                BridgeEdgeModel.edge_id,
                BridgeModel.max_weight_tonnes,
                BridgeModel.max_height_meters,
            )
            .join(BridgeModel, BridgeModel.id == BridgeEdgeModel.bridge_id)
        )
        b_res = await self.session.execute(b_stmt)
        bridge_map: dict[UUID, list[dict[str, Any]]] = {}
        for row in b_res.all():
            bridge_map.setdefault(row[0], []).append({
                "max_weight_tonnes": row[1],
                "max_height_meters": row[2],
            })

        # Fetch restrictions mapped to edges
        r_stmt = select(
            EdgeRestrictionModel.edge_id,
            EdgeRestrictionModel.kind,
            EdgeRestrictionModel.value_numeric,
            EdgeRestrictionModel.valid_from,
            EdgeRestrictionModel.valid_until,
        )
        r_res = await self.session.execute(r_stmt)
        restr_map: dict[UUID, list[dict[str, Any]]] = {}
        for row in r_res.all():
            restr_map.setdefault(row[0], []).append({
                "kind": row[1],
                "value": row[2],
                "valid_from": row[3],
                "valid_until": row[4],
            })

        for e in edges:
            e["bridges"] = bridge_map.get(e["id"], [])
            e["restrictions"] = restr_map.get(e["id"], [])

        return edges

    async def execute_dijkstra(
        self,
        edge_subquery_sql: str,
        source_index: int,
        target_index: int,
    ) -> list[dict[str, Any]]:
        safe_edge_sql = edge_subquery_sql.replace("'", "''")
        query = text(f"""
            SELECT d.seq,
                   d.node,
                   d.edge,
                   d.cost,
                   d.agg_cost,
                   e.id AS edge_uuid,
                   e.length_meters,
                   e.source_index,
                   e.target_index
            FROM pgr_dijkstra(
                '{safe_edge_sql}',
                CAST(:source AS BIGINT),
                CAST(:target AS BIGINT),
                true
            ) d
            LEFT JOIN road_edges e ON e.edge_index = d.edge
            ORDER BY d.seq
        """)
        try:
            res = await self.session.execute(query, {"source": source_index, "target": target_index})
            rows = res.all()
        except Exception:
            return []

        segments = []
        for r in rows:
            if r.edge != -1:
                is_reverse = (r.node == r.target_index)
                segments.append({
                    "seq": r.seq,
                    "node": r.node,
                    "edge_index": r.edge,
                    "edge_id": r.edge_uuid,
                    "cost": float(r.cost),
                    "agg_cost": float(r.agg_cost),
                    "length_meters": r.length_meters or 0,
                    "source_index": r.source_index,
                    "target_index": r.target_index,
                    "is_reverse": is_reverse,
                })
        return segments

    async def execute_ksp(
        self,
        edge_subquery_sql: str,
        source_index: int,
        target_index: int,
        k: int = 3,
    ) -> list[dict[str, Any]]:
        safe_edge_sql = edge_subquery_sql.replace("'", "''")
        query = text(f"""
            SELECT k.seq,
                   k.path_id,
                   k.path_seq,
                   k.node,
                   k.edge,
                   k.cost,
                   k.agg_cost,
                   e.id AS edge_uuid,
                   e.length_meters,
                   e.source_index,
                   e.target_index
            FROM pgr_ksp(
                '{safe_edge_sql}',
                CAST(:source AS BIGINT),
                CAST(:target AS BIGINT),
                CAST(:k AS INTEGER),
                directed := true,
                heap_paths := false
            ) k
            LEFT JOIN road_edges e ON e.edge_index = k.edge
            ORDER BY k.path_id, k.path_seq
        """)
        try:
            res = await self.session.execute(query, {
                "source": source_index,
                "target": target_index,
                "k": k,
            })
            rows = res.all()
        except Exception:
            return []

        segments = []
        for r in rows:
            if r.edge != -1:
                is_reverse = (r.node == r.target_index)
                segments.append({
                    "path_id": r.path_id,
                    "path_seq": r.path_seq,
                    "node": r.node,
                    "edge_index": r.edge,
                    "edge_id": r.edge_uuid,
                    "cost": float(r.cost),
                    "agg_cost": float(r.agg_cost),
                    "length_meters": r.length_meters or 0,
                    "source_index": r.source_index,
                    "target_index": r.target_index,
                    "is_reverse": is_reverse,
                })
        return segments

    async def get_edges_geometries(self, edge_ids: list[UUID]) -> dict[UUID, dict[str, Any]]:
        if not edge_ids:
            return {}
        stmt = select(RoadEdgeModel.id, ST_AsGeoJSON(RoadEdgeModel.geom)).where(
            RoadEdgeModel.id.in_(edge_ids)
        )
        res = await self.session.execute(stmt)
        out = {}
        for row in res.all():
            if row[1]:
                out[row[0]] = json.loads(row[1])
        return out

    async def save_route_plan(self, plan: RoutePlan) -> None:
        # Build PostGIS geometry for primary route
        primary_wkt = None
        if plan.primary_geometry and "coordinates" in plan.primary_geometry:
            coords = plan.primary_geometry["coordinates"]
            if len(coords) >= 2:
                points_str = ", ".join(f"{pt[0]} {pt[1]}" for pt in coords)
                primary_wkt = f"SRID=4326;LINESTRING({points_str})"

        geom_val = ST_GeomFromText(primary_wkt, 4326) if primary_wkt else None

        plan_m = RoutePlanModel(
            id=plan.id,
            organization_id=plan.organization_id,
            trip_id=plan.trip_id,
            network_version_id=plan.network_version_id,
            graph_version=plan.graph_version,
            status_version=plan.status_version,
            policy_version=plan.policy_version.value,
            origin_node_id=plan.origin_node_id,
            destination_node_id=plan.destination_node_id,
            result_status=plan.result_status.value,
            total_distance_meters=plan.total_distance_meters,
            total_duration_seconds=plan.total_duration_seconds,
            risk_penalty_score=plan.risk_penalty_score,
            requires_human_review=plan.requires_human_review,
            excluded_edge_reasons=plan.excluded_edge_reasons,
            primary_geometry=geom_val,
            alternative_geometries=plan.alternative_geometries,
            vehicle_id=plan.vehicle_id,
            vehicle_weight_kg=plan.vehicle_weight_kg,
            vehicle_height_m=plan.vehicle_height_m,
            is_hazmat=plan.is_hazmat,
            cargo_priority=plan.cargo_priority,
            departure_time=plan.departure_time,
            evaluated_at=plan.evaluated_at,
            expires_at=plan.expires_at,
            created_at=plan.created_at,
        )
        self.session.add(plan_m)

        # Save primary edges
        for e in plan.edges:
            edge_m = RoutePlanEdgeModel(
                route_plan_id=plan.id,
                edge_id=e.edge_id,
                sequence_order=e.sequence_order,
                cumulative_distance_meters=e.cumulative_distance_meters,
                cumulative_duration_seconds=e.cumulative_duration_seconds,
                is_alternative=False,
                alternative_rank=0,
            )
            self.session.add(edge_m)

        # Save alternative edges
        for alt in plan.alternatives:
            for ae in alt.edges:
                alt_edge_m = RoutePlanEdgeModel(
                    route_plan_id=plan.id,
                    edge_id=ae.edge_id,
                    sequence_order=ae.sequence_order,
                    cumulative_distance_meters=ae.cumulative_distance_meters,
                    cumulative_duration_seconds=ae.cumulative_duration_seconds,
                    is_alternative=True,
                    alternative_rank=alt.rank,
                )
                self.session.add(alt_edge_m)

        await self.session.flush()

    async def get_route_plan_by_id(self, route_plan_id: UUID) -> RoutePlan | None:
        stmt = (
            select(RoutePlanModel, ST_AsGeoJSON(RoutePlanModel.primary_geometry))
            .where(RoutePlanModel.id == route_plan_id)
        )
        res = await self.session.execute(stmt)
        row = res.first()
        if not row:
            return None
        m, geom_json_str = row

        # Fetch edges
        e_stmt = (
            select(RoutePlanEdgeModel)
            .where(RoutePlanEdgeModel.route_plan_id == route_plan_id)
            .order_by(RoutePlanEdgeModel.alternative_rank, RoutePlanEdgeModel.sequence_order)
        )
        e_res = await self.session.execute(e_stmt)
        edge_models = e_res.scalars().all()

        primary_edges = []
        alt_edges_by_rank: dict[int, list[RouteEdge]] = {}
        for em in edge_models:
            re = RouteEdge(
                edge_id=em.edge_id,
                sequence_order=em.sequence_order,
                cumulative_distance_meters=em.cumulative_distance_meters,
                cumulative_duration_seconds=em.cumulative_duration_seconds,
                is_alternative=em.is_alternative,
                alternative_rank=em.alternative_rank,
            )
            if not em.is_alternative:
                primary_edges.append(re)
            else:
                alt_edges_by_rank.setdefault(em.alternative_rank, []).append(re)

        alternatives = []
        for rank, a_edges in alt_edges_by_rank.items():
            tot_dist = a_edges[-1].cumulative_distance_meters if a_edges else 0
            tot_dur = a_edges[-1].cumulative_duration_seconds if a_edges else 0
            alt_geom = None
            if m.alternative_geometries and len(m.alternative_geometries) >= rank:
                alt_geom = m.alternative_geometries[rank - 1]
            alternatives.append(
                AlternativeRoute(
                    rank=rank,
                    edges=a_edges,
                    total_distance_meters=tot_dist,
                    total_duration_seconds=tot_dur,
                    risk_penalty_score=0.0,
                    geometry_geojson=alt_geom or {},
                )
            )

        return RoutePlan(
            id=m.id,
            organization_id=m.organization_id,
            trip_id=m.trip_id,
            network_version_id=m.network_version_id,
            graph_version=m.graph_version,
            status_version=m.status_version,
            policy_version=PolicyVersion(m.policy_version),
            origin_node_id=m.origin_node_id,
            destination_node_id=m.destination_node_id,
            result_status=RouteResultStatus(m.result_status),
            total_distance_meters=m.total_distance_meters,
            total_duration_seconds=m.total_duration_seconds,
            risk_penalty_score=float(m.risk_penalty_score),
            requires_human_review=m.requires_human_review,
            excluded_edge_reasons=m.excluded_edge_reasons or {},
            primary_geometry=json.loads(geom_json_str) if geom_json_str else None,
            alternative_geometries=m.alternative_geometries or [],
            edges=primary_edges,
            alternatives=alternatives,
            vehicle_id=m.vehicle_id,
            vehicle_weight_kg=float(m.vehicle_weight_kg),
            vehicle_height_m=float(m.vehicle_height_m),
            is_hazmat=m.is_hazmat,
            cargo_priority=m.cargo_priority,
            departure_time=m.departure_time,
            evaluated_at=m.evaluated_at,
            expires_at=m.expires_at,
            created_at=m.created_at,
        )

    async def save_dispatch_decision(self, decision: DispatchDecision) -> None:
        m = DispatchDecisionModel(
            id=decision.id,
            trip_id=decision.trip_id,
            route_plan_id=decision.route_plan_id,
            actor_id=decision.actor_id,
            action=decision.action.value,
            selected_alternative_rank=decision.selected_alternative_rank,
            reason=decision.reason,
            status_version_at_decision=decision.status_version_at_decision,
            decided_at=decision.decided_at,
            created_at=decision.created_at,
        )
        self.session.add(m)

        # Update trip's current_route_snapshot_id if ACCEPTED or DIVERTED
        if decision.action in (DispatchAction.ACCEPTED, DispatchAction.DIVERTED):
            trip_stmt = select(TripModel).where(TripModel.id == decision.trip_id)
            trip_res = await self.session.execute(trip_stmt)
            trip_m = trip_res.scalar_one_or_none()
            if trip_m:
                trip_m.current_route_snapshot_id = decision.route_plan_id
                if decision.action == DispatchAction.ACCEPTED and trip_m.status == "PLANNED":
                    trip_m.status = "DISPATCHED"

        await self.session.flush()
