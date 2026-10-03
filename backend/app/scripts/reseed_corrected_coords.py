"""
app/scripts/reseed_corrected_coords.py - One-shot wipe + reseed with corrected coordinates.

Run from the backend directory with the venv active:
    python -m app.scripts.reseed_corrected_coords
"""
from __future__ import annotations
import asyncio
from uuid import UUID
import sqlalchemy as sa
from app.core.db import AsyncSessionLocal
from app.modules.incidents.infrastructure.models import IncidentModel, IncidentReportModel, OutboxEventModel, ReviewDecisionModel
from app.modules.logistics.infrastructure.models import DeliveryCommitmentModel, TripCommitmentModel, TripModel, TripStopModel
from app.modules.reporting.infrastructure.models import MediaObjectModel, ReportMediaModel, ReportModel
from app.modules.telemetry.infrastructure.models import DeviceReplayLedgerModel, PositionBreadcrumbModel, VehicleCurrentPositionModel
from app.scripts.seed_reporting_demo import seed_reporting_demo_data
from app.scripts.seed_fleet_demo import seed_fleet_demo_data

REPORT_IDS = [
    UUID("e0000001-0000-4000-8000-000000000001"),
    UUID("e0000002-0000-4000-8000-000000000002"),
    UUID("e0000003-0000-4000-8000-000000000003"),
    UUID("e0000004-0000-4000-8000-000000000004"),
    UUID("e0000005-0000-4000-8000-000000000005"),
    UUID("e0000006-0000-4000-8000-000000000006"),
]
INCIDENT_1_ID = UUID("c0000001-0000-4000-8000-000000000001")
MEDIA_1_ID = UUID("f0000001-0000-4000-8000-000000000001")

async def wipe(db) -> None:
    print("[reseed] Wiping old seed data...")
    # Order matters — delete dependents before parents to avoid FK violations.
    # 1. review_decisions → references reports & incidents
    await db.execute(sa.delete(ReviewDecisionModel))
    # 2. outbox_events (no FK issues but clean early)
    await db.execute(sa.delete(OutboxEventModel))
    # 3. incident_reports junction table → references both incidents & reports
    await db.execute(sa.delete(IncidentReportModel))
    # 4. incidents — delete ALL incidents whose primary_report_id is one of our
    #    seeded reports (not just INCIDENT_1_ID) to avoid FK violation when
    #    deleting reports below.
    await db.execute(
        sa.delete(IncidentModel).where(
            IncidentModel.primary_report_id.in_(REPORT_IDS)
        )
    )
    # 5. report_media junction
    await db.execute(sa.delete(ReportMediaModel))
    # 6. media objects
    await db.execute(sa.delete(MediaObjectModel).where(MediaObjectModel.id == MEDIA_1_ID))
    # 7. reports (safe now — no more FK references)
    await db.execute(sa.delete(ReportModel).where(ReportModel.id.in_(REPORT_IDS)))
    # 8. fleet / telemetry tables (no FK to reports)
    await db.execute(sa.delete(TripCommitmentModel))
    await db.execute(sa.delete(TripStopModel))
    await db.execute(sa.delete(PositionBreadcrumbModel))
    await db.execute(sa.delete(VehicleCurrentPositionModel))
    await db.execute(sa.delete(DeviceReplayLedgerModel))
    await db.execute(sa.delete(DeliveryCommitmentModel))
    await db.execute(sa.delete(TripModel))
    await db.commit()
    print("[reseed] Wipe complete.")

async def main() -> None:
    async with AsyncSessionLocal() as s:
        await wipe(s)
    async with AsyncSessionLocal() as s:
        print("[reseed] Re-seeding reporting + incident data...")
        await seed_reporting_demo_data(s)
        await s.commit()
        print("[reseed] Reporting done.")
    async with AsyncSessionLocal() as s:
        print("[reseed] Re-seeding fleet + telemetry data...")
        await seed_fleet_demo_data(s)
        print("[reseed] Fleet done.")
    print("All data re-seeded with verified NH-6 GPS coordinates!")

if __name__ == "__main__":
    asyncio.run(main())
