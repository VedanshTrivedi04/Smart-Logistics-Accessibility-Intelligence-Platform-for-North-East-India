# Shared / Known issues (as of 2026-09-24)

- **Last updated:** 2026-09-25

- `AccessibilityExplorer.tsx` (used by /gov/map): ~25 type errors; API Incident has no lat/lon, vehicle has no plate_number/speed_kmh. Untouched at user's request.
- Pre-existing lint errors: `app/page.tsx`, `features/routing/ElevationProfile.tsx`, `features/routing/PublicRouteCheck.tsx`.
- Backend integration tests need Postgres + seeds (seed_demo, load_pilot_corridor, seed_fleet_demo, seed_reporting_demo); verified 2026-09-25 on a local PostGIS docker (496 passed). Occasional flake: `test_incident_to_impact_worker` takes `batch_size=10` from a shared outbox table, so leftover PENDING rows can push its event out of the batch.
- `IncidentCommandCenter.tsx` has hard-coded demo terrain metadata; large inline styles.
- TRANSPORT_OPERATOR lacks `VIEW_FLEET` in baseline but /logistics/operator is guarded by it.
- compose.yaml vs memory.md disagree on MinIO.
- Pending: frontend-proxy vs backend integration testing; staging CD.
- Large uncommitted working tree (backend coordination module, migration 008, regions, command center, screenshots `map_e2e_*.png` in repo root).

- **CRITICAL (found 2026-09-25, NOT fixed - team decision):** `get_db()` never commits and the routers of reporting (5 mutating routes), incidents (4), logistics (5), telemetry (3) and impact (1) contain no `commit()`. Probe: `POST /api/v1/reports` returned 201 but the row was never persisted (reports count unchanged, row absent). Integration tests hide it because they `commit()` manually. Routers that commit explicitly: network, routing, hazard, coordination, public, identity, and `/ai/voice-report`. Fix options: commit at the end of `get_db()` on success, or add `await db.commit()` in each router.

- **(2026-09-25) Startup writes:** `backend/app/main.py` lifespan runs `seed_regional_network` on EVERY start (commit f829517), so starting the backend against a shared DB (e.g. `backend/.env` -> Neon) writes to it each time. It also seeds facilities with `kind="DISTRIBUTION_CENTER"`, which is not in `FacilityKind`, so reading those rows raises `ValueError` (breaks `tests/integration/network/*` on any DB the API has started against).
- **(2026-09-25) Migrations:** Neon is at `011_report_altitude_road_side` but `backend/alembic/versions/` only reaches `009_merge_cv_verification`; the 010/011 files are not in the repo. Never rename existing revision ids.
- **(2026-09-25) Failing test in HEAD:** `tests/unit/identity/test_role_capabilities.py::TestCoordinationCapability::test_other_roles_cannot_coordinate[DISTRICT_VERIFIER]`.
- **(2026-09-25) `backend/.env` points to the shared Neon DB** and `conftest.py` loads it: run pytest only with an explicit local DATABASE_URL/DATABASE_URL_DIRECT.
