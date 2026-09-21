"""
app/scripts/seed_demo.py — Deterministic Demo Seed Data.

Fix 19:
- 11 demo users (one for each canonical role)
- 3 organizations (Government, Field Authority, Logistics)
- 8 North-East jurisdictions + sample district
- Deterministic hardcoded UUIDs for idempotent runs
"""

from __future__ import annotations

import asyncio
import uuid
from datetime import datetime, timezone
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import AsyncSessionLocal
from app.modules.identity.domain.enums import (
    JurisdictionLevel,
    MembershipStatus,
    OrgKind,
    Role,
)
from app.modules.identity.infrastructure.models import (
    JurisdictionModel,
    MembershipModel,
    OrganizationModel,
    UserModel,
)

# ── Deterministic UUIDs ──────────────────────────────────────────────
# Organizations
ORG_GOV_ID = UUID("00000000-0000-4000-a000-000000000001")
ORG_FIELD_ID = UUID("00000000-0000-4000-a000-000000000002")
ORG_LOGISTICS_ID = UUID("00000000-0000-4000-a000-000000000003")

# Jurisdictions
JURIS_NER_REGION = UUID("00000001-0000-4000-8000-000000000001")
JURIS_ASSAM = UUID("00000002-0000-4000-8000-000000000001")
JURIS_MEGHALAYA = UUID("00000002-0000-4000-8000-000000000002")
JURIS_MANIPUR = UUID("00000002-0000-4000-8000-000000000003")
JURIS_TRIPURA = UUID("00000002-0000-4000-8000-000000000004")
JURIS_MIZORAM = UUID("00000002-0000-4000-8000-000000000005")
JURIS_NAGALAND = UUID("00000002-0000-4000-8000-000000000006")
JURIS_ARUNACHAL = UUID("00000002-0000-4000-8000-000000000007")
JURIS_SIKKIM = UUID("00000002-0000-4000-8000-000000000008")
JURIS_KAMRUP_DISTRICT = UUID("00000003-0000-4000-8000-000000000001")

DEMO_ORGS = [
    (ORG_GOV_ID, "ORG_NER_GOV", "NER Regional Government Authority", OrgKind.GOVERNMENT.value),
    (ORG_FIELD_ID, "ORG_ASSAM_FIELD", "Assam Field & Roads Authority", OrgKind.FIELD_AUTHORITY.value),
    (ORG_LOGISTICS_ID, "ORG_NER_LOGISTICS", "NER Integrated Logistics Consortium", OrgKind.LOGISTICS.value),
]

DEMO_JURISDICTIONS = [
    (JURIS_NER_REGION, "NER_REGION", "North-East Region", JurisdictionLevel.REGION.value, None),
    (JURIS_ASSAM, "STATE_AS", "Assam", JurisdictionLevel.STATE.value, JURIS_NER_REGION),
    (JURIS_MEGHALAYA, "STATE_ML", "Meghalaya", JurisdictionLevel.STATE.value, JURIS_NER_REGION),
    (JURIS_MANIPUR, "STATE_MN", "Manipur", JurisdictionLevel.STATE.value, JURIS_NER_REGION),
    (JURIS_TRIPURA, "STATE_TR", "Tripura", JurisdictionLevel.STATE.value, JURIS_NER_REGION),
    (JURIS_MIZORAM, "STATE_MZ", "Mizoram", JurisdictionLevel.STATE.value, JURIS_NER_REGION),
    (JURIS_NAGALAND, "STATE_NL", "Nagaland", JurisdictionLevel.STATE.value, JURIS_NER_REGION),
    (JURIS_ARUNACHAL, "STATE_AR", "Arunachal Pradesh", JurisdictionLevel.STATE.value, JURIS_NER_REGION),
    (JURIS_SIKKIM, "STATE_SK", "Sikkim", JurisdictionLevel.STATE.value, JURIS_NER_REGION),
    (JURIS_KAMRUP_DISTRICT, "DIST_KAMRUP", "Kamrup Metropolitan", JurisdictionLevel.DISTRICT.value, JURIS_ASSAM),
]

DEMO_USERS = [
    (UUID("d0000001-0000-4000-8000-000000000001"), "Ananya Sharma", "ananya@ner-gov.in", Role.REGIONAL_AUTHORITY, ORG_GOV_ID),
    (UUID("d0000002-0000-4000-8000-000000000002"), "Bhaskar Singh", "bhaskar@assam-gov.in", Role.STATE_AUTHORITY, ORG_GOV_ID),
    (UUID("d0000003-0000-4000-8000-000000000003"), "Chitralekha Devi", "chitra@kamrup-verifier.in", Role.DISTRICT_VERIFIER, ORG_GOV_ID),
    (UUID("d0000004-0000-4000-8000-000000000004"), "Debraj Kalita", "debraj@emergency-ner.in", Role.EMERGENCY_COORDINATOR, ORG_GOV_ID),
    (UUID("d0000005-0000-4000-8000-000000000005"), "Elangbam Meitei", "elangbam@field-assam.in", Role.FIELD_OFFICER, ORG_FIELD_ID),
    (UUID("d0000006-0000-4000-8000-000000000006"), "Falguni Boro", "falguni@village-assam.in", Role.LOCAL_AUTHORITY, ORG_FIELD_ID),
    (UUID("d0000007-0000-4000-8000-000000000007"), "Girish Nongmeikapam", "girish@roads-assam.in", Role.ROAD_INSPECTION, ORG_FIELD_ID),
    (UUID("d0000008-0000-4000-8000-000000000008"), "Hema Goswami", "hema@ner-logistics.com", Role.FLEET_MANAGER, ORG_LOGISTICS_ID),
    (UUID("d0000009-0000-4000-8000-000000000009"), "Indraneil Datta", "indraneil@ner-logistics.com", Role.DELIVERY_COORDINATOR, ORG_LOGISTICS_ID),
    (UUID("d0000010-0000-4000-8000-000000000010"), "Jayashree Teron", "jayashree@driver-ner.com", Role.TRANSPORT_OPERATOR, ORG_LOGISTICS_ID),
    (UUID("d0000011-0000-4000-8000-000000000011"), "Kaushik Hazarika", "kaushik@admin-ner.gov.in", Role.PLATFORM_ADMINISTRATOR, ORG_GOV_ID),
]


async def seed_demo_data(db: AsyncSession) -> None:
    now = datetime.now(timezone.utc)

    # 1. Seed Organizations
    for org_id, code, name, kind in DEMO_ORGS:
        res = await db.execute(select(OrganizationModel).where(OrganizationModel.id == org_id))
        if not res.scalar_one_or_none():
            db.add(OrganizationModel(id=org_id, code=code, name=name, kind=kind, is_active=True))

    await db.flush()

    # 2. Seed Jurisdictions
    for j_id, code, name, level, parent_id in DEMO_JURISDICTIONS:
        res = await db.execute(select(JurisdictionModel).where(JurisdictionModel.id == j_id))
        if not res.scalar_one_or_none():
            db.add(JurisdictionModel(id=j_id, code=code, name=name, level=level, parent_id=parent_id))

    await db.flush()

    # 3. Seed Users & Memberships
    for user_id, name, email, role, org_id in DEMO_USERS:
        res = await db.execute(select(UserModel).where(UserModel.id == user_id))
        if not res.scalar_one_or_none():
            db.add(UserModel(
                id=user_id,
                issuer="local-dev",
                subject=f"demo-sub-{str(user_id)[:8]}",
                email=email,
                display_name=name,
                is_active=True,
            ))

        mem_res = await db.execute(
            select(MembershipModel).where(
                MembershipModel.user_id == user_id,
                MembershipModel.org_id == org_id,
            )
        )
        if not mem_res.scalar_one_or_none():
            db.add(MembershipModel(
                id=uuid.uuid4(),
                user_id=user_id,
                org_id=org_id,
                role=role.value,
                status=MembershipStatus.ACTIVE.value,
                valid_from=now,
            ))

    await db.commit()
    print("Demo seed data created successfully.")


if __name__ == "__main__":
    async def _run() -> None:
        async with AsyncSessionLocal() as session:
            await seed_demo_data(session)

    asyncio.run(_run())
