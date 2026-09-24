# Shared / Known issues (as of 2026-09-24)

- **Last updated:** 2026-09-24

- `AccessibilityExplorer.tsx` (used by /gov/map): ~25 type errors; API Incident has no lat/lon, vehicle has no plate_number/speed_kmh. Untouched at user's request.
- Pre-existing lint errors: `app/page.tsx`, `features/routing/ElevationProfile.tsx`, `features/routing/PublicRouteCheck.tsx`.
- Backend integration tests need Postgres; not run.
- `IncidentCommandCenter.tsx` has hard-coded demo terrain metadata; large inline styles.
- TRANSPORT_OPERATOR lacks `VIEW_FLEET` in baseline but /logistics/operator is guarded by it.
- compose.yaml vs memory.md disagree on MinIO.
- Pending: frontend-proxy vs backend integration testing; staging CD.
- Large uncommitted working tree (backend coordination module, migration 008, regions, command center, screenshots `map_e2e_*.png` in repo root).
