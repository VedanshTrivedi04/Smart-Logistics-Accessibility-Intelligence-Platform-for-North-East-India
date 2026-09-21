"""
app/modules/telemetry/application/simulator.py — Labelled synthetic corridor replay simulator.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from uuid import UUID

from app.modules.telemetry.application.ingest_telemetry import IngestTelemetryUseCase
from app.modules.telemetry.application.ports import TelemetryRepositoryPort
from app.modules.telemetry.domain.entities import (
    BatchIngestResult,
    Device,
    RawTelemetryFix,
)
from app.modules.telemetry.domain.enums import FixQuality

# Key waypoints along NH-6 from Guwahati (Khanapara) to Shillong Civil Hospital
PILOT_CORRIDOR_WAYPOINTS = [
    (26.1152, 91.8153, 0.0, 45.0),    # Khanapara Entry
    (26.0821, 91.8684, 150.0, 40.0),   # Byrnihat Bridge
    (25.9080, 91.8795, 300.0, 38.0),   # Nongpoh Central
    (25.6650, 91.8950, 950.0, 35.0),   # Umiam Dam Viewpoint
    (25.5788, 91.8825, 1496.0, 30.0),  # Shillong Civil Hospital
]


class CorridorReplaySimulator:
    def __init__(self, repository: TelemetryRepositoryPort):
        self.repository = repository
        self.ingest_use_case = IngestTelemetryUseCase(repository)

    async def execute(
        self,
        device: Device,
        vehicle_id: UUID,
        start_sequence: int = 1,
        step_interval_seconds: int = 30,
    ) -> BatchIngestResult:
        now = datetime.now(timezone.utc) - timedelta(seconds=step_interval_seconds * len(PILOT_CORRIDOR_WAYPOINTS))

        fixes: list[RawTelemetryFix] = []
        for idx, (lat, lon, alt, spd) in enumerate(PILOT_CORRIDOR_WAYPOINTS):
            fix_time = now + timedelta(seconds=step_interval_seconds * idx)
            fixes.append(
                RawTelemetryFix(
                    sequence_number=start_sequence + idx,
                    event_at=fix_time,
                    lat=lat,
                    lon=lon,
                    speed_kph=spd,
                    heading_deg=175.0,  # Southward towards Shillong
                    altitude_m=alt,
                    battery_pct=95.0 - (idx * 2.0),
                    fix_quality=FixQuality.SIMULATED_REPLAY,
                )
            )

        return await self.ingest_use_case.execute(
            device=device,
            vehicle_id=vehicle_id,
            fixes=fixes,
            is_simulated=True,
        )
