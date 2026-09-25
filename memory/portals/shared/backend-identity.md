# Shared / Backend: identity

- **Last updated:** 2026-09-26

- **Source:** backend/app/modules/identity/, migration 002
- **Status:** done

- Roles (11), capabilities, `ROLE_CAPABILITY_MAP` (see [[shared/nav-and-auth]]). `Capability` enum includes COORDINATE_RESPONSE. `ResourceKind`, `MembershipStatus` (ACTIVE/SUSPENDED/EXPIRED/REVOKED), `JurisdictionLevel` (REGION, state, district).
- Role `DISTRICT_VERIFIER` capabilities updated (2026-09-25) to include `VIEW_REGION`, `VIEW_IMPACT`, `VIEW_FLEET`, `COORDINATE_RESPONSE`, and `EXPORT_DATA` so District Officers have full operational oversight across their district jurisdiction.
- Endpoints (/api/v1): GET auth/oidc/init, auth/oidc/callback, auth/csrf-token, me; POST auth/select-org, auth/session/logout, auth/session/logout-all, auth/dev-session, seed-demo.
- Security guarantees: LOCAL_AUTHORITY cannot verify reports; PLATFORM_ADMINISTRATOR has no media access by default.
- Tests: `backend/tests/unit/identity/test_role_capabilities.py`.

## Jurisdiction scope and RLS status (2026-09-26)
- `ResolvePrincipalUseCase` expands granted jurisdictions down the hierarchy (`resolve_jurisdiction_scope`, recursive CTE) and sets `home_jurisdiction_id` and `region_wide`. Grants are only in the `grants` table; `python -m app.scripts.seed_jurisdiction_grants` (idempotent) scopes the demo users: field officer, road inspector, local authority, district verifier -> DIST_KAMRUP; state authority -> STATE_AS; regional authority and emergency coordinator -> NER_REGION.
- **Row-level security is NOT applied.** `rls_policy_sql.py` defines policies for identity tables only, none are enabled in the database, and the app connects as `ner_admin`, which has BYPASSRLS. `set_transaction_rls_context` therefore has no effect; isolation is enforced in application code. Enabling RLS needs a non-bypass database role.
- The dev environment runs `APP_ENV=development`, `DEV_JWT_MODE=True`, `DEMO_MODE=True`: `X-Dev-*` headers can impersonate any role (config refuses this in staging/production).
