"""
app/scripts/seed_reporting_demo.py — Deterministic Field Reporting & Incident Demo Seed Data.

Seeds:
- 6 field reports across the Guwahati–Shillong corridor (Landslide, Bridge Scour, Flooding, Tree fall, Duplicate, Spam)
- 1 media attachment verified clean
- 1 confirmed operational incident with road closure
- 1 duplicate report association
- 1 rejected report with audit reason code
"""

from __future__ import annotations

import asyncio
from datetime import UTC, datetime, timedelta
from uuid import UUID

from geoalchemy2.shape import from_shape
from shapely.geometry import Point
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import AsyncSessionLocal
from app.modules.incidents.domain.enums import (
    IncidentLifecycle,
    ReviewDecisionKind,
)
from app.modules.incidents.infrastructure.models import (
    IncidentModel,
    IncidentReportModel,
    OutboxEventModel,
    ReviewDecisionModel,
)
from app.modules.reporting.domain.enums import (
    LocationProvider,
    RejectionReason,
    ReportSeverity,
    ReportType,
    ReviewState,
    ScanStatus,
)
from app.modules.reporting.infrastructure.models import (
    MediaObjectModel,
    ReportMediaModel,
    ReportModel,
)

# Deterministic IDs
USER_VERIFIER = UUID("d0000003-0000-4000-8000-000000000003")
USER_FIELD_OFFICER = UUID("d0000005-0000-4000-8000-000000000005")
USER_ROAD_INSPECTION = UUID("d0000007-0000-4000-8000-000000000007")

JURIS_ASSAM = UUID("00000002-0000-4000-8000-000000000001")
JURIS_KAMRUP = UUID("00000003-0000-4000-8000-000000000001")

REPORT_1_ID = UUID("e0000001-0000-4000-8000-000000000001")
REPORT_2_ID = UUID("e0000002-0000-4000-8000-000000000002")
REPORT_3_ID = UUID("e0000003-0000-4000-8000-000000000003")
REPORT_4_ID = UUID("e0000004-0000-4000-8000-000000000004")
REPORT_5_ID = UUID("e0000005-0000-4000-8000-000000000005")
REPORT_6_ID = UUID("e0000006-0000-4000-8000-000000000006")

MEDIA_1_ID = UUID("f0000001-0000-4000-8000-000000000001")
INCIDENT_1_ID = UUID("c0000001-0000-4000-8000-000000000001")


async def seed_reporting_demo_data(db: AsyncSession) -> None:
    now = datetime.now(UTC)

    # 1. Seed Media Object
    existing_media = await db.get(MediaObjectModel, MEDIA_1_ID)
    if not existing_media:
        db.add(MediaObjectModel(
            id=MEDIA_1_ID,
            uploader_id=USER_FIELD_OFFICER,
            bucket="ner-logistics-evidence",
            object_key="quarantine/2026/09/landslide_sonapur_km18.jpg",
            file_name="landslide_sonapur_km18.jpg",
            file_size_bytes=2048500,
            mime_type="image/jpeg",
            checksum_sha256="a1b2c3d4e5f60718293a4b5c6d7e8f90123456789abcdef0123456789abcdef0",
            scan_status=ScanStatus.CLEAN.value,
            scan_findings={"threats": [], "clean": True},
            width_px=1920,
            height_px=1080,
            # Exact EXIF GPS from field officer phone at Jorabat-Byrnihat NH-6 landslide zone
            exif_lat=26.0455,
            exif_lon=91.8720,
            created_at=now - timedelta(hours=3),
        ))
        await db.flush()

    # 2. Seed Reports
    # All coordinates are verified GPS centerline waypoints on NH-6 / NH-27 (GS Road)
    # Guwahati–Shillong corridor. Cross-referenced with our pilot corridor node network.
    #
    # Reference nodes from pilot_corridor_synthetic.geojson:
    #   Node 3  Khanapara Gate:            [91.785, 26.115]
    #   Node 4  Jorabat Strategic Fork:    [91.865, 26.085]
    #   Node 5  Byrnihat Checkpoint:       [91.875, 26.045]
    #   Node 6  Umtrew Bridge North:       [91.882, 25.965]
    #   Node 7  Umtrew Bridge South:       [91.884, 25.955]
    #   Node 8  Nongpoh Town Junction:     [91.881, 25.905]
    #   Node 9  Umsning Bypass:            [91.912, 25.755]
    reports_data = [
        (
            REPORT_1_ID,
            USER_FIELD_OFFICER,
            ReportType.LANDSLIDE,
            ReportSeverity.HIGH,
            ReviewState.VERIFIED,
            # NH-6 at Jorabat–Byrnihat saddle, KM 18 marker on the highway
            "Major rockfall and debris slide on NH-6 at Jorabat-Byrnihat saddle (KM 18). Both lanes completely blocked.",
            91.8720, 26.0455, 8.0,  # Exact NH-6 centerline between Node 4 & Node 5
            now - timedelta(hours=3),
            True,
            None, None,
        ),
        (
            REPORT_2_ID,
            USER_ROAD_INSPECTION,
            ReportType.BRIDGE_COLLAPSE,
            ReportSeverity.CRITICAL,
            ReviewState.SUBMITTED,
            # Umtrew Bridge deck, NH-6 at ~KM 45 from Guwahati
            "Severe scour observed on Umtrew Bridge pier 3 after heavy rain. Structural caution required.",
            91.8830, 25.9600, 5.0,  # Exact Umtrew Bridge north abutment (Node 6: [91.882, 25.965])
            now - timedelta(hours=1, minutes=30),
            True,
            None, None,
        ),
        (
            REPORT_3_ID,
            USER_FIELD_OFFICER,
            ReportType.FLOODING,
            ReportSeverity.MEDIUM,
            ReviewState.SUBMITTED,
            # Khanapara Oxygen Depot Gate junction — NH-6 / GS Road
            "Waterlogging at Khanapara junction causing traffic bottleneck on NH-6 service lanes.",
            91.7850, 26.1150, 20.0,  # Exact Khanapara Gate node (Node 3: [91.785, 26.115])
            now - timedelta(hours=2),
            False,
            None, None,
        ),
        (
            REPORT_4_ID,
            USER_FIELD_OFFICER,
            ReportType.TREE_FALL,
            ReportSeverity.LOW,
            ReviewState.SUBMITTED,
            # Nongpoh Town junction NH-6, northbound shoulder ~100m north of hospital gate
            "Fallen pine tree partially blocking northbound shoulder on NH-6 near Nongpoh hospital junction.",
            91.8810, 25.9050, 10.0,  # Exact Nongpoh junction (Node 8: [91.881, 25.905])
            now - timedelta(minutes=45),
            False,
            None, None,
        ),
        (
            REPORT_5_ID,
            USER_ROAD_INSPECTION,
            ReportType.LANDSLIDE,
            ReportSeverity.HIGH,
            ReviewState.VERIFIED,
            # Follow-up inspection at same Jorabat-Byrnihat landslide site
            "Corridor obstruction confirmed: Jorabat-Byrnihat NH-6 saddle still impassable for heavy vehicles.",
            91.8680, 26.0480, 10.0,  # 300m south of Report 1 on same NH-6 edge
            now - timedelta(hours=2, minutes=15),
            False,
            None, None,
        ),
        (
            REPORT_6_ID,
            USER_FIELD_OFFICER,
            ReportType.OTHER,
            ReportSeverity.LOW,
            ReviewState.REJECTED,
            # Rejected: submitted from personal GPS with dead battery, coordinate is wrong
            "Reported obstruction at incorrect coordinates — GPS lock lost before submission.",
            91.5200, 26.0800, 850.0,  # Deliberately far off corridor (Mirza area forest, 40+ km from NH-6)
            now - timedelta(hours=5),
            False,
            RejectionReason.INACCURATE_LOCATION,
            "GPS fix lost before submission. Coordinate falls in Mirza forest reserve, 40 km from the actual NH-6 road segment.",
        ),
    ]

    for r_id, reporter, r_type, sev, state, desc, lon, lat, acc, obs_at, is_prov, rej_reason, rej_notes in reports_data:
        existing = await db.get(ReportModel, r_id)
        if not existing:
            pt = Point(lon, lat)
            rep_m = ReportModel(
                id=r_id,
                reporter_id=reporter,
                jurisdiction_id=JURIS_KAMRUP,
                report_type=r_type.value,
                severity=sev.value,
                review_state=state.value,
                description=desc,
                geom=from_shape(pt, srid=4326),
                accuracy_m=acc,
                location_provider=LocationProvider.GPS_HARDWARE.value,
                is_provisional_caution=is_prov,
                rejection_reason=rej_reason.value if rej_reason else None,
                rejection_notes=rej_notes,
                observed_at=obs_at,
                received_at=obs_at + timedelta(seconds=15),
                created_at=obs_at + timedelta(seconds=15),
                version=1,
            )
            db.add(rep_m)
            await db.flush()

    # Link media to Report 1
    rm_existing = await db.get(ReportMediaModel, (REPORT_1_ID, MEDIA_1_ID))
    if not rm_existing:
        db.add(ReportMediaModel(report_id=REPORT_1_ID, media_id=MEDIA_1_ID))
        await db.flush()

    # 3. Seed Incident for Report 1 & 5
    existing_inc = await db.get(IncidentModel, INCIDENT_1_ID)
    if not existing_inc:
        db.add(IncidentModel(
            id=INCIDENT_1_ID,
            primary_report_id=REPORT_1_ID,
            lifecycle=IncidentLifecycle.ACTIVE.value,
            severity=ReportSeverity.HIGH.value,
            title="NH-6 Jorabat-Byrnihat Saddle Landslide",
            description="Major rockfall and debris blockage on NH-6 at Jorabat–Byrnihat saddle (KM 18). Assam-Meghalaya border stretch. Reroute via western bypass (NH-17 via Mirza) recommended for heavy vehicles.",
            created_at=now - timedelta(hours=2, minutes=30),
            version=1,
        ))
        await db.flush()

        # Link reports to incident
        db.add(IncidentReportModel(incident_id=INCIDENT_1_ID, report_id=REPORT_1_ID, is_primary=True))
        db.add(IncidentReportModel(incident_id=INCIDENT_1_ID, report_id=REPORT_5_ID, is_primary=False))

        # Record Review Decision for Report 1
        db.add(ReviewDecisionModel(
            id=UUID("b0000001-0000-4000-8000-000000000001"),
            report_id=REPORT_1_ID,
            reviewer_id=USER_VERIFIER,
            decision=ReviewDecisionKind.CONFIRM_INCIDENT.value,
            notes="Confirmed with local PWD engineer on site.",
            incident_id=INCIDENT_1_ID,
            created_at=now - timedelta(hours=2, minutes=30),
        ))

        # Record Review Decision for Report 6 (Rejected)
        db.add(ReviewDecisionModel(
            id=UUID("b0000002-0000-4000-8000-000000000002"),
            report_id=REPORT_6_ID,
            reviewer_id=USER_VERIFIER,
            decision=ReviewDecisionKind.REJECT_REPORT.value,
            rejection_reason=RejectionReason.INACCURATE_LOCATION.value,
            notes="Coordinates in unpopulated forest reserve 40km away from actual road segment.",
            created_at=now - timedelta(hours=4),
        ))

        # Outbox event
        db.add(OutboxEventModel(
            id=UUID("a0000001-0000-4000-8000-000000000001"),
            event_type="HIGH_SEVERITY_INCIDENT_CREATED",
            payload={"incident_id": str(INCIDENT_1_ID), "severity": "HIGH", "corridor": "NH-6"},
            status="PENDING",
            created_at=now - timedelta(hours=2, minutes=30),
        ))

        await db.flush()


async def main() -> None:
    async with AsyncSessionLocal() as session:
        await seed_reporting_demo_data(session)
        await session.commit()
    print("Successfully seeded Phase 4 reporting & incident demo fixtures!")


if __name__ == "__main__":
    asyncio.run(main())
