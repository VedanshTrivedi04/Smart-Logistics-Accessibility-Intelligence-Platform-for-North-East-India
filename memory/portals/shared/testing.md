# Shared / Testing and verification

- **Last updated:** 2026-09-26

- **Frontend:** `pnpm test` (vitest; files: domain-logic, offline-db, queue-state, regions-coordination, sync-engine, ui), `pnpm typecheck`, `pnpm lint` (max-warnings 0), `pnpm test:e2e` (Playwright: access-isolation, offline-report-journey).
- **Backend:** pytest unit suites per module under `backend/tests/unit` (201 passing as of 2026-09-24); integration tests need Postgres and were not run.
- **Baseline (2026-09-22):** 79 vitest tests, typecheck and lint clean. **Now:** typecheck fails (AccessibilityExplorer, ~25 errors) and lint has pre-existing errors in `app/page.tsx`, `ElevationProfile.tsx`, `PublicRouteCheck.tsx`.

## Status 2026-09-26
- Backend unit: 410 passed, 7 skipped. Frontend: vitest 130 passed, `tsc` 0 errors, ESLint clean, `next build` passes. Integration tests still need Postgres and were not run.
- Real end-to-end checks run against the Neon database and Cloudinary (scripts were throwaway, test rows removed): photo upload -> confirm -> report sync -> reviewer sees photo; scope checks for 9 roles.
- Playwright (production build, desktop and Pixel 5): access-isolation passes except the accessibility test (color-contrast failures on the sign-in page and field home); offline journey, second-user isolation and account tests pass. The "different verifier can review" test is stale (the gov Reports page no longer has an "Awaiting review" tab) and needs rewriting.
- New unit files: `report-payload`, `upload-transport`, `offline-extras`; backend `test_report_access`, `test_media_scan`, `test_cloudinary_storage`, `test_router_commits`, `test_road_condition_update`, `test_report_passability`.
