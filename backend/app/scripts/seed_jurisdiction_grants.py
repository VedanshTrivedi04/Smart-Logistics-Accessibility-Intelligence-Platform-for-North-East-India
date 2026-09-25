"""
app/scripts/seed_jurisdiction_grants.py — Give the demo users their jurisdiction scope.

Report visibility is limited to a principal's granted jurisdictions (see
app/modules/reporting/application/access.py), so without these grants every gov user sees only
their own reports. Grants are matched to users by display name and to jurisdictions by code.

Idempotent: a user who already has an active grant covering the jurisdiction is left alone.

Run:  python -m app.scripts.seed_jurisdiction_grants
"""

from __future__ import annotations

import asyncio
from uuid import UUID

from sqlalchemy import select

from app.core.db import AsyncSessionLocal
from app.modules.identity.infrastructure.models import (
    GrantModel,
    JurisdictionModel,
    MembershipModel,
    UserModel,
)

# display name -> jurisdiction code
DEMO_SCOPES: dict[str, str] = {
    "Elangbam Meitei": "DIST_KAMRUP",  # field officer: assigned district (tags their reports)
    "Girish Nongmeikapam": "DIST_KAMRUP",  # road inspection
    "Falguni Boro": "DIST_KAMRUP",  # local authority
    "Chitralekha Devi": "DIST_KAMRUP",  # district verifier
    "Bhaskar Singh": "STATE_AS",  # state authority (Assam) covers its districts
    "Ananya Sharma": "NER_REGION",  # regional authority: whole region
    "Debraj Kalita": "NER_REGION",  # emergency coordinator: whole region
}
GRANTOR_NAME = "Kaushik Hazarika"  # platform administrator


async def main() -> None:
    created = 0
    async with AsyncSessionLocal() as db:
        jurisdictions = {j.code: j.id for j in (await db.execute(select(JurisdictionModel))).scalars()}
        users = {u.display_name: u for u in (await db.execute(select(UserModel))).scalars()}

        grantor = users.get(GRANTOR_NAME)
        if grantor is None:
            raise SystemExit(f"Grantor '{GRANTOR_NAME}' not found; seed the demo users first.")
        grantor_org = (
            await db.execute(select(MembershipModel.org_id).where(MembershipModel.user_id == grantor.id))
        ).scalars().first()

        for name, code in DEMO_SCOPES.items():
            user, j_id = users.get(name), jurisdictions.get(code)
            if user is None or j_id is None:
                print(f"skip {name}: user or jurisdiction {code} not found")
                continue
            existing = (
                await db.execute(
                    select(GrantModel).where(
                        GrantModel.grantee_user_id == user.id,
                        GrantModel.scope_type == "JURISDICTION",
                        GrantModel.is_active.is_(True),
                        GrantModel.revoked_at.is_(None),
                    )
                )
            ).scalars().all()
            if any(str(j_id) in [str(x) for x in g.jurisdiction_ids] for g in existing):
                print(f"ok   {name}: already scoped to {code}")
                continue
            db.add(
                GrantModel(
                    grantor_user_id=grantor.id,
                    grantor_org_id=UUID(str(grantor_org)),
                    grantee_user_id=user.id,
                    scope_type="JURISDICTION",
                    capabilities=[],
                    jurisdiction_ids=[str(j_id)],
                )
            )
            created += 1
            print(f"add  {name}: {code}")
        await db.commit()
    print(f"done, {created} grant(s) created")


if __name__ == "__main__":
    asyncio.run(main())
