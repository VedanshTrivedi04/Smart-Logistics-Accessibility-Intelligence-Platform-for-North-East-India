# Shared / Backend: identity

- **Last updated:** 2026-09-27

- **Source:** backend/app/modules/identity/, migration 002
- **Status:** done

- Roles (10 canonical roles; `LOCAL_AUTHORITY` removed cleanly in Phase 0). Capabilities: added `CONDUCT_INSPECTION` and `ASSIGN_INSPECTION`. `ROLE_CAPABILITY_MAP` (see [[shared/nav-and-auth]]).
- Role `ROAD_INSPECTION` updated to Senior Road Inspector (`inspector` surface) with authoritative assignment-scoped capabilities: `CONDUCT_INSPECTION`, `VERIFY_REPORT`, `UPDATE_ROAD_STATUS`, `VIEW_ROAD_STATUS`, `VIEW_REPORT_SUMMARY`, `VIEW_REPORT_DETAIL`, `VIEW_REPORT_MEDIA`.
- Role `DISTRICT_VERIFIER`, `STATE_AUTHORITY`, `EMERGENCY_COORDINATOR`, and `PLATFORM_ADMINISTRATOR` have `ASSIGN_INSPECTION`.
- Seeded demo users: Falguni Boro re-assigned to `Role.FIELD_OFFICER`; Girish Nongmeikapam is Senior Road Inspector.
- Tests: `backend/tests/unit/identity/test_role_capabilities.py` (55 passing).

## Jurisdiction scope and RLS status (2026-09-26)
- `ResolvePrincipalUseCase` expands granted jurisdictions down the hierarchy (`resolve_jurisdiction_scope`, recursive CTE) and sets `home_jurisdiction_id` and `region_wide`. Grants are only in the `grants` table; `python -m app.scripts.seed_jurisdiction_grants` (idempotent) scopes the demo users: field officer, road inspector, local authority, district verifier -> DIST_KAMRUP; state authority -> STATE_AS; regional authority and emergency coordinator -> NER_REGION.
- **Row-level security is NOT applied.** `rls_policy_sql.py` defines policies for identity tables only, none are enabled in the database, and the app connects as `ner_admin`, which has BYPASSRLS. `set_transaction_rls_context` therefore has no effect; isolation is enforced in application code. Enabling RLS needs a non-bypass database role.
- The dev environment runs `APP_ENV=development`, `DEV_JWT_MODE=True`, `DEMO_MODE=True`: `X-Dev-*` headers can impersonate any role (config refuses this in staging/production).
