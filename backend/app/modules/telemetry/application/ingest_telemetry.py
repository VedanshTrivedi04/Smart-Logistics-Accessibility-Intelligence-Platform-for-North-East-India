"""
app/modules/telemetry/application/ingest_telemetry.py — Transactional batch telemetry ingestion.
"""

from __future__ import annotations

from datetime import datetime, timezone
from uuid import UUID, uuid4

from app.modules.telemetry.application.ports import TelemetryRepositoryPort
from app.modules.telemetry.domain.entities import (
    BatchIngestResult,
    BreadcrumbPoint,
    Device,
    DeviceReplayLedger,
    FixResult,
    RawTelemetryFix,
    VehicleCurrentPosition,
    get_source_rank,
    validate_coordinates,
)
from app.modules.telemetry.domain.enums import DeviceType, FixOutcome, QuarantineReason
from app.modules.telemetry.domain.exceptions import (
    DeviceNotAssignedError,
    DeviceVehicleMismatchError,
)


class IngestTelemetryUseCase:
    def __init__(self, repository: TelemetryRepositoryPort):
        self.repository = repository

    async def execute(
        self,
        device: Device,
        vehicle_id: UUID,
        fixes: list[RawTelemetryFix],
        is_simulated: bool = False,
    ) -> BatchIngestResult:
        # 1. Device ↔ Vehicle authorization
        if device.vehicle_id is None:
            raise DeviceNotAssignedError(f"Device '{device.device_code}' is not assigned to any vehicle")
        if device.vehicle_id != vehicle_id:
            raise DeviceVehicleMismatchError(
                f"Device '{device.device_code}' is assigned to vehicle '{device.vehicle_id}', not '{vehicle_id}'"
            )

        now = datetime.now(timezone.utc)

        # 2. Acquire Row Locks
        ledger = await self.repository.get_replay_ledger(device.id, for_update=True)
        current_pos = await self.repository.get_current_position(vehicle_id, for_update=True)
        active_trip_id = await self.repository.get_active_trip_for_vehicle(vehicle_id)

        last_seq = ledger.last_sequence_number if ledger else -1
        last_event_at = ledger.last_event_at if ledger else None

        results: list[FixResult] = []
        breadcrumbs_to_save: list[BreadcrumbPoint] = []
        candidate_pos: VehicleCurrentPosition | None = current_pos

        source_rank = get_source_rank(device.device_type)

        # Sort fixes by sequence number to ensure ordered evaluation
        sorted_fixes = sorted(fixes, key=lambda f: f.sequence_number)

        for fix in sorted_fixes:
            # Ensure timezone awareness on event_at
            evt_time = fix.event_at if fix.event_at.tzinfo else fix.event_at.replace(tzinfo=timezone.utc)

            # Check 1: Numeric and coordinate validity
            valid, err = validate_coordinates(fix.lat, fix.lon, fix.heading_deg, fix.speed_kph)
            if not valid:
                results.append(FixResult(
                    sequence_number=fix.sequence_number,
                    outcome=FixOutcome.QUARANTINED,
                    reason=QuarantineReason.IMPOSSIBLE_COORDINATES.value,
                ))
                continue

            # Check 2: Future clock skew guard (> 15 minutes)
            skew_seconds = (evt_time - now).total_seconds()
            if skew_seconds > 900:
                results.append(FixResult(
                    sequence_number=fix.sequence_number,
                    outcome=FixOutcome.QUARANTINED,
                    reason=QuarantineReason.FUTURE_CLOCK_SKEW.value,
                ))
                continue

            # Check 3: Replay & sequence monotonicity
            if last_seq >= 0 and fix.sequence_number <= last_seq:
                results.append(FixResult(
                    sequence_number=fix.sequence_number,
                    outcome=FixOutcome.DUPLICATE_IGNORED,
                    reason="Sequence number already processed or out of order",
                ))
                continue

            # Check 4: Clock anomaly check (sequence increased but timestamp went backward > 1 hour)
            if last_event_at and (last_event_at - evt_time).total_seconds() > 3600:
                results.append(FixResult(
                    sequence_number=fix.sequence_number,
                    outcome=FixOutcome.QUARANTINED,
                    reason=QuarantineReason.CLOCK_ANOMALY.value,
                ))
                continue

            # Check 5: Speed anomaly (> 140 km/h)
            is_anomalous = fix.speed_kph > 140.0
            outcome = FixOutcome.ACCEPTED_WITH_ANOMALY if is_anomalous else FixOutcome.ACCEPTED

            results.append(FixResult(
                sequence_number=fix.sequence_number,
                outcome=outcome,
                reason="Mountain road speed anomaly detected (>140 km/h)" if is_anomalous else None,
            ))

            # Update running sequence tracker
            last_seq = fix.sequence_number
            last_event_at = evt_time

            # Create breadcrumb
            bc = BreadcrumbPoint(
                id=uuid4(),
                vehicle_id=vehicle_id,
                device_id=device.id,
                trip_id=active_trip_id,
                lat=fix.lat,
                lon=fix.lon,
                event_at=evt_time,
                received_at=now,
                sequence_number=fix.sequence_number,
                speed_kph=fix.speed_kph,
                heading_deg=fix.heading_deg,
                fix_quality=fix.fix_quality,
                source_type=device.device_type,
                is_anomalous_speed=is_anomalous,
                is_simulated=is_simulated or (device.device_type == DeviceType.LABELED_SIMULATOR_REPLAY),
                created_at=now,
            )
            breadcrumbs_to_save.append(bc)

            # Update candidate current position ONLY IF not anomalous speed
            if not is_anomalous:
                can_update_pos = False
                if candidate_pos is None:
                    can_update_pos = True
                else:
                    # Newer timestamp
                    is_newer = evt_time > candidate_pos.event_at
                    # Source precedence: higher rank or current position is older than 60s
                    age_diff = (now - candidate_pos.event_at).total_seconds()
                    has_precedence = (source_rank <= candidate_pos.source_rank) or (age_diff > 60)
                    if is_newer and has_precedence:
                        can_update_pos = True

                if can_update_pos:
                    candidate_pos = VehicleCurrentPosition(
                        vehicle_id=vehicle_id,
                        device_id=device.id,
                        active_trip_id=active_trip_id,
                        lat=fix.lat,
                        lon=fix.lon,
                        event_at=evt_time,
                        received_at=now,
                        speed_kph=fix.speed_kph,
                        heading_deg=fix.heading_deg,
                        altitude_m=fix.altitude_m,
                        battery_pct=fix.battery_pct,
                        fix_quality=fix.fix_quality,
                        source_type=device.device_type,
                        source_rank=source_rank,
                        snapped_edge_id=None,
                        is_simulated=is_simulated or (device.device_type == DeviceType.LABELED_SIMULATOR_REPLAY),
                        updated_at=now,
                    )

        # 3. Persist State Changes
        if last_seq >= 0 and last_event_at:
            new_ledger = DeviceReplayLedger(
                device_id=device.id,
                vehicle_id=vehicle_id,
                last_sequence_number=last_seq,
                last_event_at=last_event_at,
                last_received_at=now,
                updated_at=now,
            )
            await self.repository.save_replay_ledger(new_ledger)

        if candidate_pos and (current_pos is None or candidate_pos.event_at > current_pos.event_at):
            await self.repository.upsert_current_position(candidate_pos)

        if breadcrumbs_to_save:
            await self.repository.save_breadcrumbs(breadcrumbs_to_save)

        await self.repository.update_device_last_seen(device.id, now)

        # 4. Geofencing evaluation if active trip exists and last fix is valid
        if active_trip_id and candidate_pos and not candidate_pos.is_simulated:
            await self.repository.check_and_update_stop_geofence(
                trip_id=active_trip_id,
                current_lat=candidate_pos.lat,
                current_lon=candidate_pos.lon,
                arrival_time=candidate_pos.event_at,
            )

        accepted_count = sum(1 for r in results if r.outcome in (FixOutcome.ACCEPTED, FixOutcome.ACCEPTED_WITH_ANOMALY))
        quarantined_count = sum(1 for r in results if r.outcome == FixOutcome.QUARANTINED)
        rejected_count = sum(1 for r in results if r.outcome == FixOutcome.REJECTED)

        return BatchIngestResult(
            device_id=device.id,
            vehicle_id=vehicle_id,
            processed_count=len(results),
            accepted_count=accepted_count,
            quarantined_count=quarantined_count,
            rejected_count=rejected_count,
            results=results,
        )
