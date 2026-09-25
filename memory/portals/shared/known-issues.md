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
