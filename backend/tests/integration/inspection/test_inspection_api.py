"""
tests/integration/inspection/test_inspection_api.py — Integration tests for Inspection endpoints.
"""

from __future__ import annotations

import hashlib
import io
import uuid

import pytest
from httpx import ASGITransport, AsyncClient
from PIL import Image
from sqlalchemy import text
from starlette.status import HTTP_200_OK, HTTP_201_CREATED, HTTP_403_FORBIDDEN

from app.core.db import AsyncSessionLocal
from app.main import app
from app.modules.identity.domain.enums import Role


def _jpeg_bytes() -> bytes:
    buf = io.BytesIO()
    Image.new("RGB", (64, 48), (40, 90, 40)).save(buf, format="JPEG")
    return buf.getvalue()


@pytest.fixture
async def client() -> AsyncClient:
    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://testserver",
    ) as c:
        yield c


class TestInspectionApi:
    async def test_create_and_list_inspections(self, client: AsyncClient) -> None:
        coordinator_id = str(uuid.UUID("d0000003-0000-4000-8000-000000000003")) # Chitralekha (District Verifier)
        inspector_id = str(uuid.UUID("d0000007-0000-4000-8000-000000000007")) # Girish (Road Inspection)
        jurisdiction_id = "00000003-0000-4000-8000-000000000001"

        # 1. Coordinator assigns inspection
        assign_res = await client.post(
            "/api/v1/inspections",
            headers={
                "X-Dev-User-Id": coordinator_id,
                "X-Dev-Role": Role.DISTRICT_VERIFIER.value,
            },
            json={
                "assigned_to": inspector_id,
                "jurisdiction_id": jurisdiction_id,
                "priority": "HIGH",
                "instructions": "Investigate bridge scour at NH-6 km 42",
                "candidate_edge_id": "06a8d7b4-a64d-5756-97f7-0c870722b5bf",
            },
        )
        assert assign_res.status_code == HTTP_201_CREATED, assign_res.text
        data = assign_res.json()
        inspection_id = data["id"]
        assert data["priority"] == "HIGH"
        assert data["status"] == "ASSIGNED"

        # 2. Inspector lists their assigned inspections
        list_res = await client.get(
            "/api/v1/inspections",
            headers={
                "X-Dev-User-Id": inspector_id,
                "X-Dev-Role": Role.ROAD_INSPECTION.value,
            },
        )
        assert list_res.status_code == HTTP_200_OK
        items = list_res.json()
        assert any(i["id"] == inspection_id for i in items)

        # 3. Inspector starts inspection
        start_res = await client.post(
            f"/api/v1/inspections/{inspection_id}/start",
            headers={
                "X-Dev-User-Id": inspector_id,
                "X-Dev-Role": Role.ROAD_INSPECTION.value,
            },
        )
        assert start_res.status_code == HTTP_200_OK
        assert start_res.json()["status"] == "IN_PROGRESS"

        # 4. Inspector submits technical assessment
        assess_res = await client.post(
            f"/api/v1/inspections/{inspection_id}/assessment",
            headers={
                "X-Dev-User-Id": inspector_id,
                "X-Dev-Role": Role.ROAD_INSPECTION.value,
            },
            json={
                "assessment": {
                    "road_condition": "Deep scour on western pier footing",
                    "passability": "EMERGENCY_ONLY",
                    "damage_type": "BRIDGE_SCOUR",
                    "stability": "MONITORING_REQUIRED",
                    "bridge_pier_scour_depth_m": 1.4,
                    "heavy_vehicle_passable": False,
                    "recommended_speed_limit_kmh": 20,
                    "technical_notes": "Foundation partially undermined by floodwaters.",
                },
                "evidence": [],
            },
        )
        assert assess_res.status_code == HTTP_200_OK
        assert assess_res.json()["assessment"]["bridge_pier_scour_depth_m"] == 1.4

        # 5. A fake / never-uploaded photo is rejected cleanly, not as a raw DB error
        # (regression: this used to reach the database and fail as a foreign-key violation).
        bad_evidence_res = await client.post(
            f"/api/v1/inspections/{inspection_id}/assessment",
            headers={"X-Dev-User-Id": inspector_id, "X-Dev-Role": Role.ROAD_INSPECTION.value},
            json={
                "assessment": {"road_condition": "x", "passability": "IMPASSABLE", "damage_type": "BRIDGE_SCOUR"},
                "evidence": [{"media_id": str(uuid.uuid4()), "kind": "WIDE_ANGLE"}],
            },
        )
        assert bad_evidence_res.status_code == 400, bad_evidence_res.text

        # 6. A clean, self-uploaded photo IS accepted. The upload/Cloudinary round trip itself is
        # already covered live elsewhere; here a media row is inserted directly so this test does not
        # depend on outbound network access from inside the test runner.
        photo_bytes = _jpeg_bytes()
        media_id = str(uuid.uuid4())
        async with AsyncSessionLocal() as db:
            await db.execute(
                text(
                    "insert into media_objects (id, uploader_id, bucket, object_key, file_name, "
                    "file_size_bytes, mime_type, checksum_sha256, scan_status, created_at) "
                    "values (cast(:id as uuid), cast(:uploader as uuid), 'ner-media-quarantine', :key, 'inspection.jpg', "
                    ":size, 'image/jpeg', :sha, 'CLEAN', now())"
                ),
                {"id": media_id, "uploader": inspector_id, "key": f"quarantine/test/{media_id}.jpg", "size": len(photo_bytes), "sha": hashlib.sha256(photo_bytes).hexdigest()},
            )
            await db.commit()

        real_evidence_res = await client.post(
            f"/api/v1/inspections/{inspection_id}/assessment",
            headers={"X-Dev-User-Id": inspector_id, "X-Dev-Role": Role.ROAD_INSPECTION.value},
            json={
                "assessment": {"road_condition": "Deep scour", "passability": "EMERGENCY_ONLY", "damage_type": "BRIDGE_SCOUR", "bridge_pier_scour_depth_m": 1.4},
                "evidence": [{"media_id": media_id, "kind": "WIDE_ANGLE", "caption": "Pier 3 west footing"}],
            },
        )
        assert real_evidence_res.status_code == HTTP_200_OK, real_evidence_res.text
        assert len(real_evidence_res.json()["evidence"]) == 1

        # 7. Decide: this used to crash on every call (DeclareEdgeStatusUseCase missing a
        # required constructor argument, hit unconditionally regardless of decision).
        decide_res = await client.post(
            f"/api/v1/inspections/{inspection_id}/decide",
            headers={"X-Dev-User-Id": inspector_id, "X-Dev-Role": Role.ROAD_INSPECTION.value},
            json={"decision": "VERIFIED", "notes": "Confirmed scour, single lane only"},
        )
        assert decide_res.status_code == HTTP_200_OK, decide_res.text
        assert decide_res.json()["decision"] == "VERIFIED"

        # 8. The decision produced a durable outbox event, so the impact engine actually recalculates.
        async with AsyncSessionLocal() as db:
            n = (await db.execute(text("select count(*) from outbox_events where payload->>'edge_id' = :e"), {"e": "06a8d7b4-a64d-5756-97f7-0c870722b5bf"})).scalar_one()
        assert n >= 1

        # cleanup: this test's own rows, and the real road edge it mutated via /decide —
        # left BLOCKED/RESTRICTED here, other suites (e.g. routing) assume it is OPEN.
        async with AsyncSessionLocal() as db:
            await db.execute(text("delete from inspection_media where inspection_id = :i"), {"i": inspection_id})
            await db.execute(text("delete from inspections where id = :i"), {"i": inspection_id})
            await db.execute(text("delete from media_objects where id = :m"), {"m": media_id})
            await db.execute(text("delete from outbox_events where payload->>'edge_id' = :e"), {"e": "06a8d7b4-a64d-5756-97f7-0c870722b5bf"})
            await db.execute(
                text("update edge_status_current set status='OPEN', freshness='FRESH' where edge_id='06a8d7b4-a64d-5756-97f7-0c870722b5bf'")
            )
            await db.commit()


class TestInspectionAccessControl:
    async def test_a_role_with_no_inspection_capability_is_refused(self, client: AsyncClient) -> None:
        # Jayashree Teron: seeded TRANSPORT_OPERATOR, holds none of CONDUCT_INSPECTION /
        # ASSIGN_INSPECTION / COORDINATE_RESPONSE.
        operator_id = str(uuid.UUID("d0000010-0000-4000-8000-000000000010"))
        res = await client.get(
            "/api/v1/inspections",
            headers={"X-Dev-User-Id": operator_id, "X-Dev-Role": Role.TRANSPORT_OPERATOR.value},
        )
        assert res.status_code == HTTP_403_FORBIDDEN, res.text
