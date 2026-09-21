"""
app/modules/network/infrastructure/repository.py — PostGIS & pgRouting Repository Implementation.
"""

from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Any
from uuid import UUID

from geoalchemy2 import Geography
from geoalchemy2.shape import from_shape, to_shape
from shapely.geometry import LineString, Point, shape
import sqlalchemy as sa
from sqlalchemy import delete, func, select, text, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.modules.network.application.ports import (
    EdgeStatusRepositoryPort,
    NetworkRepositoryPort,
)
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
from app.modules.network.domain.enums import (
    AccessibilityStatus,
    FacilityKind,
    RestrictionKind,
    RoadClass,
    SourceEventType,
    StatusFreshness,
    StructuralCondition,
    SurfaceType,
)
from app.modules.network.infrastructure.models import (
    BridgeEdgeModel,
    BridgeModel,
    EdgeRestrictionModel,
    EdgeStatusCurrentModel,
    EdgeStatusEventModel,
    FacilityModel,
    NetworkVersionModel,
    RoadEdgeModel,
    RoadNodeModel,
)


class SqlAlchemyNetworkRepository(NetworkRepositoryPort, EdgeStatusRepositoryPort):
    """PostGIS & pgRouting implementation for road network queries and status tracking."""

    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    # ─────────────────────────────────────────────────────────────
    # Network Versions & Graph Import
    # ─────────────────────────────────────────────────────────────
    async def get_active_version(self) -> NetworkVersion | None:
        stmt = (
            select(NetworkVersionModel)
            .where(NetworkVersionModel.status == "ACTIVE")
            .order_by(NetworkVersionModel.built_at.desc())
            .limit(1)
        )
        res = await self.session.execute(stmt)
        m = res.scalar_one_or_none()
        if not m:
            return None
        return NetworkVersion(
            id=m.id,
            code=m.code,
            name=m.name,
            status=m.status,
            built_at=m.built_at,
            metadata=m.metadata_json,
        )

    async def get_version_by_code(self, code: str) -> NetworkVersion | None:
        stmt = select(NetworkVersionModel).where(NetworkVersionModel.code == code)
        res = await self.session.execute(stmt)
        m = res.scalar_one_or_none()
        if not m:
            return None
        return NetworkVersion(
            id=m.id,
            code=m.code,
            name=m.name,
            status=m.status,
            built_at=m.built_at,
            metadata=m.metadata_json,
        )

    async def save_network_version(
        self,
        version: NetworkVersion,
        nodes: list[RoadNode],
        edges: list[RoadEdge],
        bridges: list[Bridge] | None = None,
        bridge_edge_pairs: list[tuple[UUID, UUID]] | None = None,
        restrictions: list[EdgeRestriction] | None = None,
    ) -> None:
        # 1. Upsert NetworkVersion
        v_res = await self.session.execute(select(NetworkVersionModel).where(NetworkVersionModel.id == version.id))
        v_model = v_res.scalar_one_or_none()
        if not v_model:
            v_model = NetworkVersionModel(
                id=version.id,
                code=version.code,
                name=version.name,
                status=version.status,
                built_at=version.built_at,
                metadata_json=version.metadata,
            )
            self.session.add(v_model)
            await self.session.flush()

        # 2. Add Nodes
        for n in nodes:
            n_res = await self.session.execute(select(RoadNodeModel).where(RoadNodeModel.id == n.id))
            if not n_res.scalar_one_or_none():
                pt = from_shape(Point(n.lon, n.lat), srid=4326)
                self.session.add(
                    RoadNodeModel(
                        id=n.id,
                        network_version_id=n.network_version_id,
                        node_index=n.node_index,
                        geom=pt,
                        elevation_m=n.elevation_m,
                        jurisdiction_id=n.jurisdiction_id,
                    )
                )
        await self.session.flush()

        # 3. Add Edges & Initialize Status
        for e in edges:
            e_res = await self.session.execute(select(RoadEdgeModel).where(RoadEdgeModel.id == e.id))
            if not e_res.scalar_one_or_none():
                ls = from_shape(LineString(e.coordinates), srid=4326)
                self.session.add(
                    RoadEdgeModel(
                        id=e.id,
                        network_version_id=e.network_version_id,
                        edge_index=e.edge_index,
                        source_node_id=e.source_node_id,
                        target_node_id=e.target_node_id,
                        source_index=e.source_index,
                        target_index=e.target_index,
                        geom=ls,
                        length_meters=e.length_meters,
                        road_class=e.road_class.value,
                        road_name=e.road_name,
                        surface_type=e.surface_type.value,
                        speed_limit_kmh=e.speed_limit_kmh,
                        base_seconds=e.base_seconds,
                        reverse_base_seconds=e.reverse_base_seconds,
                        elevation_gain_m=e.elevation_gain_m,
                        gradient_percent=e.gradient_percent,
                        is_bridge=e.is_bridge,
                        jurisdiction_id=e.jurisdiction_id,
                    )
                )
                # Seed default OPEN status in edge_status_current
                self.session.add(
                    EdgeStatusCurrentModel(
                        edge_id=e.id,
                        status_version=1,
                        status="OPEN",
                        freshness="FRESH",
                        effective_restrictions={},
                        last_verified_at=datetime.now(timezone.utc),
                        updated_at=datetime.now(timezone.utc),
                    )
                )
        await self.session.flush()

        # 4. Add Bridges & Bridge Edges
        if bridges:
            for b in bridges:
                b_res = await self.session.execute(select(BridgeModel).where(BridgeModel.id == b.id))
                if not b_res.scalar_one_or_none():
                    self.session.add(
                        BridgeModel(
                            id=b.id,
                            code=b.code,
                            name=b.name,
                            length_meters=b.length_meters,
                            max_weight_tonnes=b.max_weight_tonnes,
                            max_height_meters=b.max_height_meters,
                            max_axle_load_tonnes=b.max_axle_load_tonnes,
                            is_single_lane=b.is_single_lane,
                            structural_condition=b.structural_condition.value,
                            last_inspection_at=b.last_inspection_at,
                            jurisdiction_id=b.jurisdiction_id,
                        )
                    )
            await self.session.flush()

        if bridge_edge_pairs:
            for b_id, e_id in bridge_edge_pairs:
                be_res = await self.session.execute(
                    select(BridgeEdgeModel).where(
                        BridgeEdgeModel.bridge_id == b_id,
                        BridgeEdgeModel.edge_id == e_id,
                    )
                )
                if not be_res.scalar_one_or_none():
                    self.session.add(BridgeEdgeModel(bridge_id=b_id, edge_id=e_id))
            await self.session.flush()

        # 5. Add Restrictions
        if restrictions:
            for r in restrictions:
                r_res = await self.session.execute(select(EdgeRestrictionModel).where(EdgeRestrictionModel.id == r.id))
                if not r_res.scalar_one_or_none():
                    self.session.add(
                        EdgeRestrictionModel(
                            id=r.id,
                            edge_id=r.edge_id,
                            kind=r.kind.value,
                            value_numeric=r.value_numeric,
                            unit=r.unit,
                            direction=r.direction,
                            valid_from=r.valid_from,
                            valid_until=r.valid_until,
                            source_reference=r.source_reference,
                        )
                    )
            await self.session.flush()

    # ─────────────────────────────────────────────────────────────
    # Entity Lookups
    # ─────────────────────────────────────────────────────────────
    async def get_edge_by_id(self, edge_id: UUID) -> RoadEdge | None:
        stmt = select(RoadEdgeModel).where(RoadEdgeModel.id == edge_id)
        res = await self.session.execute(stmt)
        m = res.scalar_one_or_none()
        if not m:
            return None

        geom_shape = to_shape(m.geom)
        coords = list(geom_shape.coords)

        return RoadEdge(
            id=m.id,
            network_version_id=m.network_version_id,
            edge_index=m.edge_index,
            source_node_id=m.source_node_id,
            target_node_id=m.target_node_id,
            source_index=m.source_index,
            target_index=m.target_index,
            coordinates=coords,
            length_meters=m.length_meters,
            road_class=RoadClass(m.road_class),
            surface_type=SurfaceType(m.surface_type),
            speed_limit_kmh=m.speed_limit_kmh,
            base_seconds=m.base_seconds,
            reverse_base_seconds=m.reverse_base_seconds,
            road_name=m.road_name,
            elevation_gain_m=m.elevation_gain_m,
            gradient_percent=m.gradient_percent,
            is_bridge=m.is_bridge,
            jurisdiction_id=m.jurisdiction_id,
        )

    async def get_node_by_id(self, node_id: UUID) -> RoadNode | None:
        stmt = select(RoadNodeModel).where(RoadNodeModel.id == node_id)
        res = await self.session.execute(stmt)
        m = res.scalar_one_or_none()
        if not m:
            return None

        pt = to_shape(m.geom)
        return RoadNode(
            id=m.id,
            network_version_id=m.network_version_id,
            node_index=m.node_index,
            lon=pt.x,
            lat=pt.y,
            elevation_m=m.elevation_m,
            jurisdiction_id=m.jurisdiction_id,
        )

    async def get_edge_restrictions(self, edge_id: UUID) -> list[EdgeRestriction]:
        stmt = select(EdgeRestrictionModel).where(EdgeRestrictionModel.edge_id == edge_id)
        res = await self.session.execute(stmt)
        models = res.scalars().all()
        return [
            EdgeRestriction(
                id=m.id,
                edge_id=m.edge_id,
                kind=RestrictionKind(m.kind),
                value_numeric=m.value_numeric,
                unit=m.unit,
                direction=m.direction,
                valid_from=m.valid_from,
                valid_until=m.valid_until,
                source_reference=m.source_reference,
            )
            for m in models
        ]

    # ─────────────────────────────────────────────────────────────
    # Spatial BBox Queries & Snapping
    # ─────────────────────────────────────────────────────────────
    async def get_bounded_edges(
        self,
        min_lon: float,
        min_lat: float,
        max_lon: float,
        max_lat: float,
        simplify_tolerance: float | None = None,
        limit: int = 5000,
    ) -> list[tuple[RoadEdge, EdgeStatusCurrent | None]]:
        envelope = func.ST_MakeEnvelope(min_lon, min_lat, max_lon, max_lat, 4326)

        if simplify_tolerance is not None and simplify_tolerance > 0:
            geom_col = func.ST_Simplify(RoadEdgeModel.geom, simplify_tolerance)
        else:
            geom_col = RoadEdgeModel.geom

        stmt = (
            select(
                RoadEdgeModel,
                EdgeStatusCurrentModel,
                func.ST_AsGeoJSON(geom_col).label("geojson_str"),
            )
            .outerjoin(EdgeStatusCurrentModel, EdgeStatusCurrentModel.edge_id == RoadEdgeModel.id)
            .where(func.ST_Intersects(RoadEdgeModel.geom, envelope))
            .limit(limit)
        )

        res = await self.session.execute(stmt)
        rows = res.all()

        output = []
        for edge_m, status_m, geojson_str in rows:
            coords: list[tuple[float, float]] = []
            if geojson_str:
                geom_data = json.loads(geojson_str)
                coords = [tuple(c) for c in geom_data.get("coordinates", [])]

            edge = RoadEdge(
                id=edge_m.id,
                network_version_id=edge_m.network_version_id,
                edge_index=edge_m.edge_index,
                source_node_id=edge_m.source_node_id,
                target_node_id=edge_m.target_node_id,
                source_index=edge_m.source_index,
                target_index=edge_m.target_index,
                coordinates=coords,
                length_meters=edge_m.length_meters,
                road_class=RoadClass(edge_m.road_class),
                surface_type=SurfaceType(edge_m.surface_type),
                speed_limit_kmh=edge_m.speed_limit_kmh,
                base_seconds=edge_m.base_seconds,
                reverse_base_seconds=edge_m.reverse_base_seconds,
                road_name=edge_m.road_name,
                elevation_gain_m=edge_m.elevation_gain_m,
                gradient_percent=edge_m.gradient_percent,
                is_bridge=edge_m.is_bridge,
                jurisdiction_id=edge_m.jurisdiction_id,
            )

            status: EdgeStatusCurrent | None = None
            if status_m:
                status = EdgeStatusCurrent(
                    edge_id=status_m.edge_id,
                    status_version=status_m.status_version,
                    status=AccessibilityStatus(status_m.status),
                    freshness=StatusFreshness(status_m.freshness),
                    effective_restrictions=status_m.effective_restrictions,
                    source_event_id=status_m.source_event_id,
                    last_verified_at=status_m.last_verified_at,
                    expires_at=status_m.expires_at,
                    updated_at=status_m.updated_at,
                )

            output.append((edge, status))

        return output

    async def snap_point_to_node(
        self,
        lon: float,
        lat: float,
        max_distance_m: float = 2000.0,
    ) -> tuple[RoadNode, float] | None:
        point_geom = func.ST_SetSRID(func.ST_MakePoint(lon, lat), 4326)
        dist_expr = func.ST_Distance(
            RoadNodeModel.geom.cast(Geography),
            point_geom.cast(Geography),
        ).label("dist_m")

        stmt = (
            select(RoadNodeModel, dist_expr)
            .where(func.ST_DWithin(RoadNodeModel.geom.cast(Geography), point_geom.cast(Geography), max_distance_m))
            .order_by(dist_expr.asc())
            .limit(1)
        )

        res = await self.session.execute(stmt)
        row = res.first()
        if not row:
            return None

        node_m, dist_m = row
        pt = to_shape(node_m.geom)
        node = RoadNode(
            id=node_m.id,
            network_version_id=node_m.network_version_id,
            node_index=node_m.node_index,
            lon=pt.x,
            lat=pt.y,
            elevation_m=node_m.elevation_m,
            jurisdiction_id=node_m.jurisdiction_id,
        )
        return node, float(dist_m)

    # ─────────────────────────────────────────────────────────────
    # Facilities
    # ─────────────────────────────────────────────────────────────
    async def get_facilities(
        self,
        jurisdiction_id: UUID | None = None,
        kind: FacilityKind | None = None,
        is_critical: bool | None = None,
        limit: int = 50,
    ) -> list[Facility]:
        stmt = select(FacilityModel)
        if jurisdiction_id:
            stmt = stmt.where(FacilityModel.jurisdiction_id == jurisdiction_id)
        if kind:
            stmt = stmt.where(FacilityModel.kind == kind.value)
        if is_critical is not None:
            stmt = stmt.where(FacilityModel.is_critical == is_critical)

        stmt = stmt.limit(limit)
        res = await self.session.execute(stmt)
        models = res.scalars().all()

        facilities = []
        for m in models:
            pt = to_shape(m.geom)
            facilities.append(
                Facility(
                    id=m.id,
                    code=m.code,
                    name=m.name,
                    kind=FacilityKind(m.kind),
                    jurisdiction_id=m.jurisdiction_id,
                    lon=pt.x,
                    lat=pt.y,
                    nearest_road_node_id=m.nearest_road_node_id,
                    snap_distance_m=m.snap_distance_m,
                    is_critical=m.is_critical,
                    is_active=m.is_active,
                )
            )
        return facilities

    async def get_facility_by_id(self, facility_id: UUID) -> Facility | None:
        stmt = select(FacilityModel).where(FacilityModel.id == facility_id)
        res = await self.session.execute(stmt)
        m = res.scalar_one_or_none()
        if not m:
            return None

        pt = to_shape(m.geom)
        return Facility(
            id=m.id,
            code=m.code,
            name=m.name,
            kind=FacilityKind(m.kind),
            jurisdiction_id=m.jurisdiction_id,
            lon=pt.x,
            lat=pt.y,
            nearest_road_node_id=m.nearest_road_node_id,
            snap_distance_m=m.snap_distance_m,
            is_critical=m.is_critical,
            is_active=m.is_active,
        )

    async def save_facilities(self, facilities: list[Facility]) -> None:
        for f in facilities:
            res = await self.session.execute(
                select(FacilityModel).where(
                    (FacilityModel.id == f.id) | (FacilityModel.code == f.code)
                )
            )
            existing = res.scalar_one_or_none()
            if not existing:
                pt = from_shape(Point(f.lon, f.lat), srid=4326)
                self.session.add(
                    FacilityModel(
                        id=f.id,
                        code=f.code,
                        name=f.name,
                        kind=f.kind.value,
                        jurisdiction_id=f.jurisdiction_id,
                        geom=pt,
                        nearest_road_node_id=f.nearest_road_node_id,
                        snap_distance_m=f.snap_distance_m,
                        is_critical=f.is_critical,
                        is_active=f.is_active,
                    )
                )
            else:
                existing.nearest_road_node_id = f.nearest_road_node_id
                existing.snap_distance_m = f.snap_distance_m
                existing.is_active = f.is_active
        await self.session.flush()

    # ─────────────────────────────────────────────────────────────
    # pgRouting Dijkstra Query
    # ─────────────────────────────────────────────────────────────
    async def calculate_dijkstra_path(
        self,
        source_index: int,
        target_index: int,
        exclude_blocked: bool = True,
    ) -> list[dict[str, Any]]:
        """
        Executes pgRouting pgr_dijkstra.
        Dynamically excludes BLOCKED edges if exclude_blocked is True.
        """
        filter_clause = "WHERE (s.status IS NULL OR s.status != 'BLOCKED')" if exclude_blocked else ""

        edge_sql = f"""
            SELECT e.edge_index AS id,
                   e.source_index AS source,
                   e.target_index AS target,
                   e.base_seconds AS cost,
                   e.reverse_base_seconds AS reverse_cost
            FROM road_edges e
            LEFT JOIN edge_status_current s ON s.edge_id = e.id
            {filter_clause}
        """.replace("'", "''")

        query = text(f"""
            SELECT d.seq,
                   d.node,
                   d.edge,
                   d.cost,
                   d.agg_cost,
                   e.id AS edge_uuid,
                   e.road_name,
                   e.length_meters
            FROM pgr_dijkstra(
                '{edge_sql}',
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
        except Exception as exc:
            logger.warning(
                "pgr_dijkstra query execution returned error or no path",
                source=source_index,
                target=target_index,
                error=str(exc),
            )
            return []

        segments = []
        for r in rows:
            if r.edge != -1:  # -1 represents destination terminal node
                segments.append({
                    "seq": r.seq,
                    "node_index": r.node,
                    "edge_index": r.edge,
                    "edge_id": r.edge_uuid,
                    "road_name": r.road_name,
                    "length_meters": r.length_meters,
                    "cost": float(r.cost),
                    "agg_cost": float(r.agg_cost),
                })

        return segments

    # ─────────────────────────────────────────────────────────────
    # Edge Status Management (Append-Only Event Store + Projection)
    # ─────────────────────────────────────────────────────────────
    async def get_current_status(self, edge_id: UUID) -> EdgeStatusCurrent | None:
        stmt = select(EdgeStatusCurrentModel).where(EdgeStatusCurrentModel.edge_id == edge_id)
        res = await self.session.execute(stmt)
        m = res.scalar_one_or_none()
        if not m:
            return None

        return EdgeStatusCurrent(
            edge_id=m.edge_id,
            status_version=m.status_version,
            status=AccessibilityStatus(m.status),
            freshness=StatusFreshness(m.freshness),
            effective_restrictions=m.effective_restrictions,
            source_event_id=m.source_event_id,
            last_verified_at=m.last_verified_at,
            expires_at=m.expires_at,
            updated_at=m.updated_at,
        )

    async def get_current_statuses(self, edge_ids: list[UUID]) -> dict[UUID, EdgeStatusCurrent]:
        if not edge_ids:
            return {}
        stmt = select(EdgeStatusCurrentModel).where(EdgeStatusCurrentModel.edge_id.in_(edge_ids))
        res = await self.session.execute(stmt)
        models = res.scalars().all()
        return {
            m.edge_id: EdgeStatusCurrent(
                edge_id=m.edge_id,
                status_version=m.status_version,
                status=AccessibilityStatus(m.status),
                freshness=StatusFreshness(m.freshness),
                effective_restrictions=m.effective_restrictions,
                source_event_id=m.source_event_id,
                last_verified_at=m.last_verified_at,
                expires_at=m.expires_at,
                updated_at=m.updated_at,
            )
            for m in models
        }

    async def append_status_event_and_update_current(
        self,
        event: EdgeStatusEvent,
        current: EdgeStatusCurrent,
    ) -> None:
        # 1. Append to event store (immutable)
        event_m = EdgeStatusEventModel(
            id=event.id,
            edge_id=event.edge_id,
            status=event.status.value,
            restrictions=event.restrictions,
            reason=event.reason,
            source_event_type=event.source_event_type.value,
            source_reference_id=event.source_reference_id,
            actor_user_id=event.actor_user_id,
            valid_from=event.valid_from,
            valid_until=event.valid_until,
            created_at=event.created_at,
        )
        self.session.add(event_m)
        # Flush the event first to ensure it exists in edge_status_events before edge_status_current references it
        await self.session.flush([event_m])

        # 2. Update projection
        curr_res = await self.session.execute(
            select(EdgeStatusCurrentModel).where(EdgeStatusCurrentModel.edge_id == current.edge_id)
        )
        curr_m = curr_res.scalar_one_or_none()
        if curr_m:
            curr_m.status_version = current.status_version
            curr_m.status = current.status.value
            curr_m.freshness = current.freshness.value
            curr_m.effective_restrictions = current.effective_restrictions
            curr_m.source_event_id = current.source_event_id
            curr_m.last_verified_at = current.last_verified_at
            curr_m.expires_at = current.expires_at
            curr_m.updated_at = current.updated_at or datetime.now(timezone.utc)
        else:
            curr_m = EdgeStatusCurrentModel(
                edge_id=current.edge_id,
                status_version=current.status_version,
                status=current.status.value,
                freshness=current.freshness.value,
                effective_restrictions=current.effective_restrictions,
                source_event_id=current.source_event_id,
                last_verified_at=current.last_verified_at,
                expires_at=current.expires_at,
                updated_at=current.updated_at or datetime.now(timezone.utc),
            )
            self.session.add(curr_m)
        # 3. Atomically increment global network status_version
        await self.session.execute(
            sa.update(NetworkVersionModel).values(
                status_version=NetworkVersionModel.status_version + 1
            )
        )
        await self.session.flush()

    async def get_status_history(self, edge_id: UUID, limit: int = 50) -> list[EdgeStatusEvent]:
        stmt = (
            select(EdgeStatusEventModel)
            .where(EdgeStatusEventModel.edge_id == edge_id)
            .order_by(EdgeStatusEventModel.created_at.desc())
            .limit(limit)
        )
        res = await self.session.execute(stmt)
        models = res.scalars().all()
        return [
            EdgeStatusEvent(
                id=m.id,
                edge_id=m.edge_id,
                status=AccessibilityStatus(m.status),
                restrictions=m.restrictions,
                reason=m.reason,
                source_event_type=SourceEventType(m.source_event_type),
                source_reference_id=m.source_reference_id,
                actor_user_id=m.actor_user_id,
                valid_from=m.valid_from,
                valid_until=m.valid_until,
                created_at=m.created_at,
            )
            for m in models
        ]

    async def get_global_status_version(self) -> int:
        stmt = select(func.max(NetworkVersionModel.status_version))
        res = await self.session.execute(stmt)
        v = res.scalar_one_or_none()
        return int(v) if v is not None else 1

