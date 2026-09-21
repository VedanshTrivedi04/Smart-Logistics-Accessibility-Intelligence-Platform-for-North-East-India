"""
app/modules/impact/infrastructure/repository.py — SQLAlchemy Implementation of ImpactRepositoryPort.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any
import uuid

import sqlalchemy as sa

from app.core.db import DbSession
from app.modules.impact.application.ports import ImpactRepositoryPort
from app.modules.impact.domain.entities import CommitmentImpact, FacilityImpact, TripImpact
from app.modules.impact.domain.enums import (
    ImpactSeverity,
    ImpactType,
    ReachabilityState,
    RecommendedAction,
)
from app.modules.impact.infrastructure.models import (
    CommitmentImpactModel,
    FacilityReachabilityImpactModel,
    TripImpactModel,
)


class SqlAlchemyImpactRepository(ImpactRepositoryPort):
    def __init__(self, session: DbSession) -> None:
        self.session = session

    async def get_active_trips_on_edge(self, edge_id: uuid.UUID) -> list[dict[str, Any]]:
        query = sa.text(
            """
            SELECT 
                t.id AS trip_id,
                t.vehicle_id AS vehicle_id,
                rp.id AS route_plan_id,
                ST_AsText(rp.primary_geometry) AS route_geom_wkt,
                rpe.sequence_order AS edge_sequence
            FROM trips t
            JOIN route_plans rp ON (t.current_route_snapshot_id = rp.id OR (t.current_route_snapshot_id IS NULL AND rp.trip_id = t.id))
            JOIN route_plan_edges rpe ON rpe.route_plan_id = rp.id
            WHERE rpe.edge_id = :edge_id
              AND t.status IN ('DISPATCHED', 'IN_TRANSIT')
            ORDER BY t.id, rpe.sequence_order ASC
            """
        )
        result = await self.session.execute(query, {"edge_id": edge_id})
        rows = result.mappings().all()

        trips_by_id: dict[uuid.UUID, dict[str, Any]] = {}
        for row in rows:
            t_id = row["trip_id"]
            if t_id not in trips_by_id:
                trips_by_id[t_id] = {
                    "trip_id": t_id,
                    "vehicle_id": row["vehicle_id"],
                    "route_plan_id": row["route_plan_id"],
                    "route_geom_wkt": row["route_geom_wkt"],
                    "edge_sequence": row["edge_sequence"],
                }
        return list(trips_by_id.values())

    async def get_vehicle_position(self, vehicle_id: uuid.UUID) -> dict[str, Any] | None:
        query = sa.text(
            """
            SELECT 
                vehicle_id,
                ST_X(geom) AS lon,
                ST_Y(geom) AS lat,
                event_at,
                speed_kph
            FROM vehicle_positions_current
            WHERE vehicle_id = :vehicle_id
            """
        )
        result = await self.session.execute(query, {"vehicle_id": vehicle_id})
        row = result.mappings().first()
        if not row:
            return None
        return dict(row)

    async def calculate_relative_progress(
        self,
        route_geom_wkt: str,
        veh_lon: float,
        veh_lat: float,
        edge_id: uuid.UUID,
    ) -> dict[str, Any]:
        query = sa.text(
            """
            SELECT
                ST_LineLocatePoint(
                    ST_GeomFromText(:route_geom_wkt, 4326),
                    ST_SetSRID(ST_MakePoint(:veh_lon, :veh_lat), 4326)
                ) AS veh_progress,
                ST_LineLocatePoint(
                    ST_GeomFromText(:route_geom_wkt, 4326),
                    ST_Centroid(e.geom)
                ) AS edge_progress,
                ST_Distance(
                    ST_SetSRID(ST_MakePoint(:veh_lon, :veh_lat), 4326)::geography,
                    e.geom::geography
                ) AS distance_meters
            FROM road_edges e
            WHERE e.id = :edge_id
            """
        )
        result = await self.session.execute(
            query,
            {
                "route_geom_wkt": route_geom_wkt,
                "veh_lon": veh_lon,
                "veh_lat": veh_lat,
                "edge_id": edge_id,
            },
        )
        row = result.mappings().first()
        if not row:
            return {
                "veh_progress": 0.0,
                "edge_progress": 1.0,
                "distance_meters": 0.0,
                "vehicle_is_ahead": False,
            }

        veh_progress = float(row["veh_progress"] or 0.0)
        edge_progress = float(row["edge_progress"] or 0.0)
        distance_meters = float(row["distance_meters"] or 0.0)
        vehicle_is_ahead = veh_progress >= edge_progress

        return {
            "veh_progress": veh_progress,
            "edge_progress": edge_progress,
            "distance_meters": distance_meters,
            "vehicle_is_ahead": vehicle_is_ahead,
        }

    async def get_trip_commitments(self, trip_id: uuid.UUID) -> list[dict[str, Any]]:
        query = sa.text(
            """
            SELECT 
                dc.id,
                dc.consignment_reference,
                dc.priority_tier,
                dc.required_before,
                dc.status
            FROM delivery_commitments dc
            JOIN trip_commitments tc ON tc.commitment_id = dc.id
            WHERE tc.trip_id = :trip_id
            """
        )
        result = await self.session.execute(query, {"trip_id": trip_id})
        return [dict(r) for r in result.mappings().all()]

    async def get_latest_trip_impact(self, trip_id: uuid.UUID, edge_id: uuid.UUID) -> TripImpact | None:
        query = (
            sa.select(TripImpactModel)
            .where(
                TripImpactModel.trip_id == trip_id,
                TripImpactModel.edge_id == edge_id,
            )
            .order_by(TripImpactModel.assessment_version.desc())
            .limit(1)
        )
        result = await self.session.execute(query)
        model = result.scalar_one_or_none()
        if not model:
            return None
        return self._to_trip_impact_entity(model)

    async def save_trip_impact(self, impact: TripImpact) -> None:
        inc_id = impact.incident_id
        if inc_id:
            check = await self.session.execute(
                sa.text("SELECT id FROM incidents WHERE id = :id"),
                {"id": inc_id},
            )
            if not check.scalar_one_or_none():
                inc_id = None

        model = TripImpactModel(
            id=impact.id,
            trip_id=impact.trip_id,
            incident_id=inc_id,
            edge_id=impact.edge_id,
            source_event_id=impact.source_event_id,
            source_status_version=impact.source_status_version,
            assessment_version=impact.assessment_version,
            impact_type=impact.impact_type.value,
            severity=impact.severity.value,
            delay_estimated_seconds=impact.delay_estimated_seconds,
            distance_to_disruption_meters=impact.distance_to_disruption_meters,
            recommended_action=impact.recommended_action.value,
            is_active=impact.is_active,
            resolved_reason=impact.resolved_reason,
            assessed_at=impact.assessed_at,
        )
        self.session.add(model)
        await self.session.flush()

    async def save_commitment_impact(self, impact: CommitmentImpact) -> None:
        model = CommitmentImpactModel(
            id=impact.id,
            delivery_commitment_id=impact.delivery_commitment_id,
            trip_id=impact.trip_id,
            trip_impact_id=impact.trip_impact_id,
            original_required_before=impact.original_required_before,
            projected_arrival=impact.projected_arrival,
            projected_sla_status=impact.projected_sla_status,
            delay_seconds=impact.delay_seconds,
            assessed_at=impact.assessed_at,
        )
        self.session.add(model)
        await self.session.flush()

    async def save_facility_impact(self, impact: FacilityImpact) -> None:
        inc_id = impact.incident_id
        if inc_id:
            check = await self.session.execute(
                sa.text("SELECT id FROM incidents WHERE id = :id"),
                {"id": inc_id},
            )
            if not check.scalar_one_or_none():
                inc_id = None

        model = FacilityReachabilityImpactModel(
            id=impact.id,
            facility_id=impact.facility_id,
            incident_id=inc_id,
            edge_id=impact.edge_id,
            source_status_version=impact.source_status_version,
            reachability_state=impact.reachability_state.value,
            isolated=impact.isolated,
            alternate_route_available=impact.alternate_route_available,
            access_delay_seconds=impact.access_delay_seconds,
            assessed_at=impact.assessed_at,
        )
        self.session.add(model)
        await self.session.flush()

    async def list_trip_impacts(self, trip_id: uuid.UUID, active_only: bool = True) -> list[TripImpact]:
        query = sa.select(TripImpactModel).where(TripImpactModel.trip_id == trip_id)
        if active_only:
            query = query.where(TripImpactModel.is_active.is_(True))
        query = query.order_by(TripImpactModel.assessed_at.desc())
        result = await self.session.execute(query)
        models = result.scalars().all()
        return [self._to_trip_impact_entity(m) for m in models]

    async def list_facility_impacts(self, facility_id: uuid.UUID) -> list[FacilityImpact]:
        query = (
            sa.select(FacilityReachabilityImpactModel)
            .where(FacilityReachabilityImpactModel.facility_id == facility_id)
            .order_by(FacilityReachabilityImpactModel.assessed_at.desc())
        )
        result = await self.session.execute(query)
        models = result.scalars().all()
        return [self._to_facility_impact_entity(m) for m in models]

    async def evaluate_facility_reachability_impact(
        self,
        edge_id: uuid.UUID,
        status_version: int,
        incident_id: uuid.UUID | None,
    ) -> list[FacilityImpact]:
        query = sa.text(
            """
            SELECT 
                f.id AS facility_id,
                ST_Distance(f.geom::geography, e.geom::geography) AS distance_meters
            FROM facilities f
            JOIN road_edges e ON e.id = :edge_id
            WHERE ST_DWithin(f.geom::geography, e.geom::geography, 5000)
            """
        )
        result = await self.session.execute(query, {"edge_id": edge_id})
        rows = result.mappings().all()

        impacts: list[FacilityImpact] = []
        for row in rows:
            dist = float(row["distance_meters"])
            # If extremely close (< 200m), may represent direct ingress blockage
            isolated = dist < 200.0
            reachability_state = ReachabilityState.NO_FEASIBLE_PATH if isolated else ReachabilityState.RESTRICTED_REACHABLE
            impact = FacilityImpact(
                id=uuid.uuid4(),
                facility_id=row["facility_id"],
                incident_id=incident_id,
                edge_id=edge_id,
                source_status_version=status_version,
                reachability_state=reachability_state,
                isolated=isolated,
                alternate_route_available=not isolated,
                access_delay_seconds=3600 if isolated else 1800,
                assessed_at=datetime.now(timezone.utc),
            )
            impacts.append(impact)
            await self.save_facility_impact(impact)

        return impacts

    @staticmethod
    def _to_trip_impact_entity(model: TripImpactModel) -> TripImpact:
        return TripImpact(
            id=model.id,
            trip_id=model.trip_id,
            incident_id=model.incident_id,
            edge_id=model.edge_id,
            source_event_id=model.source_event_id,
            source_status_version=model.source_status_version,
            assessment_version=model.assessment_version,
            impact_type=ImpactType(model.impact_type),
            severity=ImpactSeverity(model.severity),
            delay_estimated_seconds=model.delay_estimated_seconds,
            distance_to_disruption_meters=model.distance_to_disruption_meters,
            recommended_action=RecommendedAction(model.recommended_action),
            is_active=model.is_active,
            resolved_reason=model.resolved_reason,
            assessed_at=model.assessed_at,
        )

    @staticmethod
    def _to_facility_impact_entity(model: FacilityReachabilityImpactModel) -> FacilityImpact:
        return FacilityImpact(
            id=model.id,
            facility_id=model.facility_id,
            incident_id=model.incident_id,
            edge_id=model.edge_id,
            source_status_version=model.source_status_version,
            reachability_state=ReachabilityState(model.reachability_state),
            isolated=model.isolated,
            alternate_route_available=model.alternate_route_available,
            access_delay_seconds=model.access_delay_seconds,
            assessed_at=model.assessed_at,
        )
