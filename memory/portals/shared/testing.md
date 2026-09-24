# Shared / Testing and verification

- **Last updated:** 2026-09-24

- **Frontend:** `pnpm test` (vitest; files: domain-logic, offline-db, queue-state, regions-coordination, sync-engine, ui), `pnpm typecheck`, `pnpm lint` (max-warnings 0), `pnpm test:e2e` (Playwright: access-isolation, offline-report-journey).
- **Backend:** pytest unit suites per module under `backend/tests/unit` (201 passing as of 2026-09-24); integration tests need Postgres and were not run.
- **Baseline (2026-09-22):** 79 vitest tests, typecheck and lint clean. **Now:** typecheck fails (AccessibilityExplorer, ~25 errors) and lint has pre-existing errors in `app/page.tsx`, `ElevationProfile.tsx`, `PublicRouteCheck.tsx`.
