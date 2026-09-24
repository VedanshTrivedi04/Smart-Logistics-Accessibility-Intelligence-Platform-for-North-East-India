# Project Memory

## Project Overview

Smart Logistics & Accessibility Intelligence Platform for North East India (SIH 2026) is an emergency and multi-modal logistics platform engineered for terrain and weather-resilient transport across the North-Eastern states. It supports offline-first incident reporting, fleet tracking, route evaluation, and disaster logistics management.

## Current Architecture

* **Backend**: FastAPI, Python 3.12, SQLAlchemy / Alembic, PostgreSQL / PostGIS, Redis for real-time telemetry and queuing.
* **Frontend**: Next.js 15 (App Router), React 19, TypeScript, OpenAPI Fetch (`@/shared/api`), TanStack Query, MapLibre GL, IndexedDB (`idb`) offline synchronization engine, Vitest, Playwright.
* **Security & Auth**: HttpOnly session cookies, CSRF protection middleware, device token telemetry, zero client-side token exposure.

## Important Decisions

* Created and maintained dedicated `frontend` branch branched directly from `main` to isolate frontend development.
* Reinforced `.gitignore` rules across repository root and `frontend/` to strictly prevent leaking `.env`, secrets, `.next`, and `node_modules`.

## Current State

* `frontend/` module complete with 79 unit tests passing (`vitest`), full TypeScript compilation passing without errors, and ESLint passing with zero warnings.
* Offline database schema (`idb`), sync queue, field reporting, fleet management, logistics overview, and role-based route gating implemented.

## Known Issues

* None currently in the frontend application test suite.

## Pending Work

* Integration testing between frontend proxy and backend API endpoints.
* Continuous deployment setup for staging environments.

## Interaction History

### 2026-09-22 00:16

**User Request**
> Create a new branch from main named frontend and push frontend code there with precaution.

**Exploration**
- Checked workspace git roots and remotes. Confirmed repository root at `D:\firebox\Sih 2026\Smart-Logistics-Accessibility-Intelligence-Platform-for-North-East-India`.
- Discovered remote: `origin` pointing to `https://github.com/VedanshTrivedi04/Smart-Logistics-Accessibility-Intelligence-Platform-for-North-East-India.git`.
- Inspected git status: verified untracked `frontend/` directory, `.gitignore`, and unrelated root documents (`SIH_2026_Pragyan_Idea_Submission.pptx`, `NER_Smart_Logistics_Portal_Wise_Functionality_Specification.md`).
- Confirmed user preference to name branch `frontend` (matching the codebase directory).
- Scanned frontend codebase for secrets, keys, and tokens. None found.
- Verified build and test integrity: Vitest (79/79 passed), `pnpm typecheck` (0 errors), `pnpm lint` (0 warnings).

**Work Done**
- Fixed typo in root `.gitignore` (`o# Environment variables` -> `# Environment variables`).
- Strengthened `frontend/.gitignore` with explicit `.env` and `.env.*` coverage.
- Created and switched to branch `frontend` from `main`.
- Created `memory.md` per project requirements.
- Staged only `frontend/`, `.gitignore`, and `memory.md`, deliberately omitting large/unrelated presentation files.
- Committed changes and pushed `frontend` branch to GitHub remote.

**Files Changed**
- `.gitignore`
  - Corrected comment syntax for environment variables.
- `frontend/.gitignore`
  - Added explicit patterns for `.env` and `.env.*` to guard against secret commits.
- `memory.md`
  - Initialized project memory document adhering to global rules.
- `frontend/*`
  - Added complete Next.js 15 frontend application with offline sync, fleet views, and unit test suites.

**Verification**
- `pnpm test`: 5 test files, 79 tests passed.
- `pnpm typecheck`: Passed with 0 errors.
- `pnpm lint`: Passed with 0 warnings.
- `git status` / `git diff`: Verified that only intended files are staged; secrets and binaries excluded.

**Response**
- Provided concise summary of branch creation, precautions applied, test validation, commit hash, and push confirmation.

**Git**
- Branch: frontend
- Commit: a5e9b50a3e8ee6d2977c81ab11c90a9fe788d727
- Push: successful (pushed to origin/frontend)
- Status: clean

**Notes**
- The large submission PPTX file in root was left untracked to avoid repository bloat.

### 2026-09-22 00:20

**User Request**
> add and push

**Exploration**
- Inspected untracked files: `NER_Smart_Logistics_Portal_Wise_Functionality_Specification.md`, `SIH_2026_Pragyan_Idea_Submission.pptx`, `docs/frontend-gaps.md`, `frontend/README.md`.
- Clarified with user on file selection; user confirmed adding only frontend documentation (`frontend/README.md` and `docs/`).

**Work Done**
- Staged `frontend/README.md`, `docs/`, and `memory.md`.
- Verified no sensitive data or build artifacts were included.
- Committed and pushed changes to `origin/frontend`.

**Files Changed**
- `frontend/README.md`
  - Added comprehensive frontend handover documentation covering architecture, roles, and verification.
- `docs/frontend-gaps.md`
  - Added specification coverage analysis and backend API gap documentation.
- `memory.md`
  - Updated persistent memory with latest interaction and commit status.

**Verification**
- `git status` / `git diff --cached`: Verified only intended markdown documentation was staged.
- Git push confirmed successful.

**Response**
- Summarized commit and push status for frontend documentation.

**Git**
- Branch: frontend
- Commit: 03fdb3a479eb170d1faefc7922d56c70be529683
- Push: successful (pushed to origin/frontend)
- Status: clean

### 2026-09-22 10:42

**User Request**
> Setup full containerization (Dockerfiles for FastAPI backend and Next.js frontend, compose configuration), keeping PostgreSQL on Neon (no local Postgres container).

**Work Done**
- Created `backend/Dockerfile` using Python 3.12, `uv` package manager with layer caching, CA certificates for secure TLS to Neon, non-root user `appuser`, and `/health/live` probe.
- Created `backend/.dockerignore` to exclude virtualenvs, caches, tests, and sensitive `.env` files.
- Configured `frontend/next.config.ts` with `output: "standalone"` for minimal production images (~150MB).
- Created `frontend/Dockerfile` multi-stage build using `node:22-alpine` and `pnpm`, producing a standalone runner executing as non-root `nextjs`.
- Created `frontend/.dockerignore` to exclude `node_modules`, `.next`, tests, and secrets.
- Created root `compose.yaml` and updated `infra/compose.yaml` orchestrating `backend`, `frontend`, `redis`, `minio`, and `createbuckets` on `ner_network` bridge network.
- Configured backend service to load `backend/.env` for remote Neon connection while overriding local Redis and MinIO endpoints.
- Updated `infra/Makefile` with convenience targets: `up`, `down`, `build`, `logs`.

**Files Changed**
- `backend/Dockerfile`
- `backend/.dockerignore`
- `backend/README.md`
- `backend/pyproject.toml`
- `frontend/next.config.ts`
- `frontend/Dockerfile`
- `frontend/.dockerignore`
- `compose.yaml`
- `infra/compose.yaml`
- `infra/Makefile`
- `memory.md`

### 2026-09-22 11:14

**Docker Build Fixes**
- Switched MinIO container images in compose from Docker Hub to `quay.io/minio/minio:latest` and `quay.io/minio/mc:latest`.
- Created `backend/README.md` to satisfy hatchling metadata validation.
- Configured `[tool.hatch.build.targets.wheel] packages = ["app"]` in `backend/pyproject.toml` so hatchling identifies `app/` as the project package.
- Added `PYTHONPATH="/app:$PYTHONPATH"` to `backend/Dockerfile`.
- Implemented missing shared frontend utility modules under `frontend/src/shared/lib/` (`geo.ts`, `format.ts`, `time.ts`, `useNow.ts`, `preferences.ts`) satisfying all unit test assertions in `domain-logic.test.ts`.
- Exported `clock` object with `now(): Date` in `time.ts` required by `AnalyticsView.tsx`.
- Removed MinIO object storage services (`minio` and `createbuckets`) from compose per user request.
- Updated Redis image to `redis:alpine` which is pulled and verified locally.






### 2026-09-24 Regional Commander gaps

**Work Done**
- Incident detail now shows affected trips, deliveries, facilities and a regional impact level (`IncidentImpact.tsx`), plus a coordination panel.
- New backend module `coordination` (migration 008, `COORDINATE_RESPONSE` capability for Regional/State/Emergency roles): `GET /jurisdictions`, `POST /coordination/actions`, `GET /coordination/summaries`. Append-only log of acknowledge, escalate, assign, inspection request and complete, and notes. It notifies no one.
- Alerts can be acknowledged or escalated; edge GeoJSON now carries `jurisdiction_id`.
- `/gov/regions` state-wise comparison and drill-down (`features/regions`); `/gov/map` uses `CommandMap` (vehicles, incidents, field reports layers).
- Added missing `bearing` and `NER_STATES` to `shared/lib/geo.ts` (repo did not typecheck without them).

**Known Issues**
- `AccessibilityExplorer.tsx` was rewritten outside this session (1048 lines) and has ~25 type errors (Incident lat/lon, vehicle plate_number/speed_kmh do not exist in the API). Left untouched at the user's request.
- Pre-existing lint errors in `app/page.tsx`, `ElevationProfile.tsx`, `PublicRouteCheck.tsx`.
- Backend integration tests need Postgres and were not run; unit tests pass (201).

### 2026-09-24 Memory folder created

**User Request**
> Add Antigravity workspace rules so memory is updated portal-wise and page-wise, then feed all memory so far.

**Work Done**
- Added `.agent/rules/memory-update.md` (always-on rule: when/what/how to update `memory/`).
- Created `memory/` with `README.md` index, 41 page files under `memory/portals/{public,field,gov,logistics}` (one per `page.tsx` route) and 27 files under `memory/portals/shared` (3 protected pages: account/status/forbidden, plus topics: nav-and-auth, offline-sync, api-client, map, ui-kit, features-*, backend-* modules, testing, infra-deploy, known-issues).
- Content derived from the current working tree (including uncommitted coordination, regions, command-center work), openapi.json and role_capabilities.py.

**Files Changed**
- `.agent/rules/memory-update.md`, `memory/**`, `memory.md`

**Notes**
- Page files marked from code reading only; nothing was executed. Known issues are collected in `memory/portals/shared/known-issues.md`.

### 2026-09-24 19:48 Field Reports & Ground Intelligence Command Center

**User Request**
> Pura backend se wired hona chahiye, no mock or dummy data, jo cheeze incident page se connect karna hai wo kar dena, no map (location in detail textually), aur memory file update kar dena.

**Work Done**
- Implemented `ReportsCommandCenter.tsx` in `frontend/src/features/incidents/ReportsCommandCenter.tsx`:
  - 100% backend dynamic data via `useReports()`, `useReport()`, `useIncidents()`, `useMediaUrl()`, `useTriage()`, `useReview()`. Zero mock data.
  - Live top analytical KPI metrics bar directly computed from PostgreSQL reports table: Total Reports, Awaiting Review (`SUBMITTED`), Under Review (`UNDER_REVIEW`/`PROVISIONAL_CAUTION`), Verified Truth (`VERIFIED`), More Info (`MORE_INFO_NEEDED`), Rejected (`REJECTED`).
  - Master Left Feed with search (highway, description, report ID), status filter pills, and severity badges with relative timestamps and photo counters.
  - Ground Intelligence Dossier (Right Pane): Officer attribution, GNSS coordinates, sensor provider (`GPS_HARDWARE`), elevation, and accuracy radius. Detailed textual corridor information (no maps per request).
  - High-resolution photographic evidence gallery with time-bounded presigned S3 URLs (`useMediaUrl`), interactive Lightbox modal with malware scan status (`Clean ✓ (SHA-256 Verified)`), and EXIF verification.
  - Stepped progression pipeline (`SUBMITTED` → `UNDER REVIEW` → `VERIFIED` / `REJECTED` / `MORE_INFO_NEEDED`).
  - Strict RBAC: Regional Commander has read-only monitoring oversight (`Shield` governance badge); adjudication and claim actions (`VERIFY_REPORT`) are gated to authorized District Verifiers.
  - Bidirectional Incident Cross-Linkage: Verified field reports link directly to their corresponding operational incident in the Incident Command Center (`/gov/incidents?selected={incident_id}`).
- Updated `IncidentCommandCenter.tsx` (`frontend/src/features/incidents/IncidentCommandCenter.tsx`):
  - Added direct link button from active incidents to `/gov/reports?selected={primary_report_id}` to drill down into the originating field report and forensic ground photos.
- Exported `ReportsCommandCenter` from `frontend/src/features/incidents/index.ts`.
- Mounted `ReportsCommandCenter` in `frontend/src/app/(protected)/gov/reports/page.tsx`.
- Updated memory documentation:
  - `memory/portals/gov/reports.md` (updated with full feature set, APIs, and RBAC rules).
  - `memory/portals/gov/incidents.md` (updated with bidirectional report cross-linking).
  - `memory/README.md` (updated gov/reports index entry).
  - `memory.md` (appended interaction history entry).

**Files Changed**
- `frontend/src/features/incidents/ReportsCommandCenter.tsx` (new)
- `frontend/src/features/incidents/index.ts`
- `frontend/src/features/incidents/IncidentCommandCenter.tsx`
- `frontend/src/app/(protected)/gov/reports/page.tsx`
- `memory/portals/gov/reports.md`
- `memory/portals/gov/incidents.md`
- `memory/README.md`
- `memory.md`


