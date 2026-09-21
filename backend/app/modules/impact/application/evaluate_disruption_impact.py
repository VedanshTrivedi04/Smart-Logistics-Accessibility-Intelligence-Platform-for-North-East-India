"""
app/modules/impact/application/evaluate_disruption_impact.py — Use Case for Disruption Impact Assessment.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any
import uuid

from app.modules.impact.application.ports import ImpactRepositoryPort
from app.modules.impact.domain.entities import CommitmentImpact, FacilityImpact, TripImpact
from app.modules.impact.domain.enums import (
    ImpactSeverity,
    ImpactType,
    RecommendedAction,
)


class EvaluateDisruptionImpactUseCase:
    def __init__(self, repository: ImpactRepositoryPort) -> None:
        self.repository = repository

    async def execute(
        self,
        edge_id: uuid.UUID,
        source_status_version: int,
        source_event_id: uuid.UUID,
        incident_id: uuid.UUID | None = None,
        impact_type: ImpactType = ImpactType.BLOCKED_ROUTE,
        severity: ImpactSeverity = ImpactSeverity.HIGH,
        delay_estimated_seconds: int = 1800,
    ) -> dict[str, Any]:
        """
        Assesses disruption impact on active trips, SLA commitments, and facility reachability.
        """
        active_trips = await self.repository.get_active_trips_on_edge(edge_id)
        assessed_trip_impacts: list[TripImpact] = []
        assessed_commitments: list[CommitmentImpact] = []

        now = datetime.now(timezone.utc)

        for trip_data in active_trips:
            trip_id = trip_data["trip_id"]
            vehicle_id = trip_data["vehicle_id"]
            route_geom_wkt = trip_data["route_geom_wkt"]

            pos = await self.repository.get_vehicle_position(vehicle_id) if vehicle_id else None

            vehicle_is_ahead = False
            distance_meters: int | None = None

            if pos and route_geom_wkt:
                progress_info = await self.repository.calculate_relative_progress(
                    route_geom_wkt=route_geom_wkt,
                    veh_lon=pos["lon"],
                    veh_lat=pos["lat"],
                    edge_id=edge_id,
                )
                vehicle_is_ahead = progress_info["vehicle_is_ahead"]
                distance_meters = int(progress_info["distance_meters"])

            prev_impact = await self.repository.get_latest_trip_impact(trip_id, edge_id)
            next_version = (prev_impact.assessment_version + 1) if prev_impact else 1

            if vehicle_is_ahead:
                # Vehicle has already cleared the blockage!
                if prev_impact and prev_impact.is_active:
                    resolved_impact = TripImpact(
                        id=uuid.uuid4(),
                        trip_id=trip_id,
                        incident_id=incident_id,
                        edge_id=edge_id,
                        source_event_id=source_event_id,
                        source_status_version=source_status_version,
                        assessment_version=next_version,
                        impact_type=impact_type,
                        severity=ImpactSeverity.LOW,
                        delay_estimated_seconds=0,
                        distance_to_disruption_meters=distance_meters,
                        recommended_action=RecommendedAction.PROCEED_WITH_CAUTION,
                        is_active=False,
                        resolved_reason="PASSED_BEFORE_DISRUPTION",
                        assessed_at=now,
                    )
                    await self.repository.save_trip_impact(resolved_impact)
                    assessed_trip_impacts.append(resolved_impact)
                continue

            # Vehicle is approaching disruption: assess action and severity
            if impact_type == ImpactType.BLOCKED_ROUTE or severity == ImpactSeverity.CRITICAL:
                recommended_action = RecommendedAction.REROUTE_MANDATORY
            elif severity == ImpactSeverity.HIGH:
                recommended_action = RecommendedAction.REROUTE_ADVISORY
            else:
                recommended_action = RecommendedAction.PROCEED_WITH_CAUTION

            trip_impact = TripImpact(
                id=uuid.uuid4(),
                trip_id=trip_id,
                incident_id=incident_id,
                edge_id=edge_id,
                source_event_id=source_event_id,
                source_status_version=source_status_version,
                assessment_version=next_version,
                impact_type=impact_type,
                severity=severity,
                delay_estimated_seconds=delay_estimated_seconds,
                distance_to_disruption_meters=distance_meters,
                recommended_action=recommended_action,
                is_active=True,
                resolved_reason=None,
                assessed_at=now,
            )
            await self.repository.save_trip_impact(trip_impact)
            assessed_trip_impacts.append(trip_impact)

            # Evaluate commitments
            commitments = await self.repository.get_trip_commitments(trip_id)
            for comm in commitments:
                req_before = comm["required_before"]
                projected_arrival = now + timedelta(seconds=delay_estimated_seconds)

                if projected_arrival > req_before:
                    projected_sla = "BREACHED"
                elif (projected_arrival + timedelta(hours=1)) > req_before:
                    projected_sla = "AT_RISK"
                else:
                    projected_sla = "ON_TIME"

                comm_impact = CommitmentImpact(
                    id=uuid.uuid4(),
                    delivery_commitment_id=comm["id"],
                    trip_id=trip_id,
                    trip_impact_id=trip_impact.id,
                    original_required_before=req_before,
                    projected_arrival=projected_arrival,
                    projected_sla_status=projected_sla,
                    delay_seconds=delay_estimated_seconds,
                    assessed_at=now,
                )
                await self.repository.save_commitment_impact(comm_impact)
                assessed_commitments.append(comm_impact)

        facility_impacts = await self.repository.evaluate_facility_reachability_impact(
            edge_id=edge_id,
            status_version=source_status_version,
            incident_id=incident_id,
        )

        return {
            "edge_id": edge_id,
            "trips_evaluated": len(active_trips),
            "trips_impacted": len([t for t in assessed_trip_impacts if t.is_active]),
            "commitments_impacted": len(assessed_commitments),
            "facilities_impacted": len(facility_impacts),
            "trip_impacts": assessed_trip_impacts,
            "facility_impacts": facility_impacts,
        }
