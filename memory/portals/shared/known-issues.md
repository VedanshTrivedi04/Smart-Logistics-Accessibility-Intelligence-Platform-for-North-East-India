# Shared / Known issues (as of 2026-09-24)

- **Last updated:** 2026-09-27

- `AccessibilityExplorer.tsx` (used by /gov/map): ~25 type errors; API Incident has no lat/lon, vehicle has no plate_number/speed_kmh. Untouched at user's request.
- Pre-existing lint errors: `app/page.tsx`, `features/routing/ElevationProfile.tsx`, `features/routing/PublicRouteCheck.tsx`.
- Backend integration tests need Postgres + seeds (seed_demo, load_pilot_corridor, seed_fleet_demo, seed_reporting_demo); verified 2026-09-25 on a local PostGIS docker (496 passed). Occasional flake: `test_incident_to_impact_worker` takes `batch_size=10` from a shared outbox table, so leftover PENDING rows can push its event out of the batch.
- `IncidentCommandCenter.tsx` has hard-coded demo terrain metadata; large inline styles.
- **[RESOLVED 2026-09-27]** TRANSPORT_OPERATOR capability gap: `Capability.VIEW_FLEET` added to `Role.TRANSPORT_OPERATOR`. Drivers can now access `/logistics/operator` cockpit without 403 Forbidden.
- **[RESOLVED 2026-09-27]** DELIVERY_COORDINATOR capability gap: `Capability.DISPATCH_ROUTE` added to `Role.DELIVERY_COORDINATOR`. Delivery coordinators can now dispatch trips and consignments.
- **[RESOLVED 2026-09-27]** FLEET_MANAGER coordination capability: `Capability.COORDINATE_RESPONSE` added to `Role.FLEET_MANAGER`. Fleet managers can record coordination directives on disrupted corridors.
- **[RESOLVED 2026-09-27]** Logistics DB commit verification: `commit()` is present across all mutating routes in `backend/app/modules/logistics/api/router.py` (verified via integration test `test_fleet_dispatch.py`).
- compose.yaml vs memory.md disagree on MinIO.
- Pending: frontend-proxy vs backend integration testing; staging CD.
- Large uncommitted working tree (backend coordination module, migration 008, regions, command center, screenshots `map_e2e_*.png` in repo root).
- **(2026-09-25) Startup writes:** `backend/app/main.py` lifespan runs `seed_regional_network` on EVERY start (commit f829517), so starting the backend against a shared DB (e.g. `backend/.env` -> Neon) writes to it each time. It also seeds facilities with `kind="DISTRIBUTION_CENTER"`, which is not in `FacilityKind`, so reading those rows raises `ValueError` (breaks `tests/integration/network/*` on any DB the API has started against).
- **(2026-09-25) Migrations:** Neon is at `011_report_altitude_road_side` but `backend/alembic/versions/` only reaches `009_merge_cv_verification`; the 010/011 files are not in the repo. Never rename existing revision ids.
- **(2026-09-25) `backend/.env` points to the shared Neon DB** and `conftest.py` loads it: run pytest only with an explicit local DATABASE_URL/DATABASE_URL_DIRECT.
