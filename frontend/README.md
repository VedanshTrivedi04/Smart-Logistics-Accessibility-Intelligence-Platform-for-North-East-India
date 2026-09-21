# NER Logistics — frontend

One Next.js 15 / React 19 / TypeScript (strict) app with three role surfaces on shared design primitives:

| Surface | Route | Roles (server-resolved) |
|---|---|---|
| Government command | `/gov` | Regional, State, District verifier, Emergency coordinator, Platform administrator |
| Field operations (offline-first) | `/field` | Field officer, Local authority, Road inspection |
| Logistics & transport | `/logistics` | Fleet manager, Delivery coordinator, Transport operator |

FastAPI is the authority for identity, permissions, road status and dispatch decisions. Menus and page guards are a convenience; every request is checked again by the server.

## Status of this handover

Built and verified in this repository (commands actually run are listed under *Verification*):
all three surfaces, the offline capture/queue/sync engine, typed API client generated from `backend/openapi.json`, import-boundary enforcement, unit tests.

**Not executed here:** the Playwright end-to-end suite (needs the seeded FastAPI + PostGIS + MinIO stack and Playwright browsers), real-device offline testing, and manual screen-reader/keyboard review. See *Known limits* before relying on it.

## Quick start

```bash
cd frontend
pnpm install --frozen-lockfile     # pnpm 10.34.5 is pinned in package.json
cp .env.example .env.local         # then edit
pnpm gen:api                       # regenerates src/shared/api/schema.d.ts from ../backend/openapi.json
pnpm dev                           # http://localhost:3000, proxies /api/v1 and /health to BACKEND_ORIGIN
```

Backend for local work: `make infra`, `make migrate`, `make seed-demo`, `make dev` from the repository root, with `DEV_JWT_MODE=true`. Set `NEXT_PUBLIC_DEV_LOGIN=1` to show the development sign-in (user/org IDs come from `backend/app/scripts/seed_demo.py`; they are labelled synthetic).

### Production sign-in (OIDC)

The backend's `/api/v1/auth/oidc/callback` returns JSON and sets the session cookie, so the browser must not be sent there directly. Set the backend `OIDC_REDIRECT_URI` to **`<frontend origin>/auth/callback`**; that page calls the backend callback with `fetch`, handles multi-organization selection, and then routes to the user's workspace.

## Scripts (all required by `frontend/workflow.py`)

| Script | What it runs |
|---|---|
| `pnpm lint` | ESLint (Next + TypeScript rules, import boundaries), `--max-warnings 0` |
| `pnpm typecheck` | `tsc --noEmit`, strict + `noUncheckedIndexedAccess` |
| `pnpm test` | Vitest, run once (not watch) |
| `pnpm test:e2e` | Playwright against a documented test server (see below) |
| `pnpm build` | `next build` |

From the repository root: `python frontend/workflow.py --root .` (or `--dry-run`), plus `python frontend/boundries.py --root .`.

### End-to-end tests

`playwright.config.ts` refuses any host that is not `localhost`, `127.0.0.1` or listed in `E2E_ALLOW_HOSTS`, so it cannot hit production. With no `E2E_BASE_URL` it builds and serves the app on port 3100 (the offline service worker exists only in production builds) with `NEXT_PUBLIC_DEV_LOGIN=1`. Prerequisites: seeded backend with `DEV_JWT_MODE=true`, `pnpm exec playwright install chromium`. Users are the labelled `seed_demo.py` identities. Projects: desktop Chromium and a Pixel 5 profile.

Suites: `access-isolation` (role surfaces, forbidden pages, server refusal, guessed IDs, keyboard skip link, axe scan) and `offline-report-journey` (offline capture → reload → restore network → sync exactly once → second user isolation → different verifier reviews).

## Architecture

```
src/app/         layouts, routes, guards, navigation (composition only)
src/features/    domain screens; cross-feature use only through each feature's index.ts
  session/ network/ incidents/ impact/ fleet/ routing/ alerts/ analytics/ overview/ field/
src/shared/      api (generated client, CSRF, errors), auth, offline (IndexedDB), map, ui, i18n, lib
```

Enforced by ESLint `no-restricted-imports` and `boundries.py`: shared never imports features/app; features never import app; other features are reached only via `index.ts`.

### Rules the code follows

* **Transport:** same-origin `/api/v1`, HttpOnly session cookie, `X-CSRF-Token` on unsafe methods (held in memory, refreshed once on `CSRF_VALIDATION_FAILED`). No tokens in web storage. A 401 anywhere moves the session to "expired" and purges protected cache.
* **Cache:** TanStack Query keys start with `[userId, orgId, jurisdictions]`; a different identity/scope purges protected data; logout clears everything.
* **No optimism** for VERIFIED, reopen, DELIVERED, accepted dispatch or road status: screens change only after the server response. A local report says **Saved on device**, never *Submitted*, until accepted.
* **Components:** `StatusBadge` (text + icon + border style), `EvidencePanel` (observation / verification / hazard kept apart), `SourceAge` (observed vs received), `CoverageBanner` (what is known, never "absent = open"), `RouteExplanation` (hard exclusions, rules label, snapshot + policy versions, expiry), `SyncQueue` (each pending operation with its remedy).
* **Wording:** "Last GPS update 12 minutes ago", "Road condition unknown; verification required". Unknown, no feasible path (`NO_FEASIBLE_PATH`) and service error each have their own state. Stale GPS is a hollow dashed marker with its age and is never extrapolated. No ETA is invented.
* **Maps:** MapLibre only in client components; bounded viewport queries (max 5000 segments, warned when truncated); blocked roads are drawn heavy with an outline, distinct from restricted/caution/unknown; every map has a parity list; markers are keyboard-focusable buttons and are clustered. Tiles come only from `NEXT_PUBLIC_MAP_TILE_URL` (licensed); never the public OSM service.

### Offline field flow

IndexedDB `ner-field` v1, stores `drafts`, `operations`, `local_media`, `sync_metadata`, every row keyed by owner. Drafts are persisted (debounced 400 ms) and "Saved on device" appears only after the write resolves. Queueing moves draft → `QUEUED` operation atomically and keeps the id, which is sent as `client_operation_id`.

`QUEUED → UPLOADING_MEDIA → SUBMITTING → SYNCED`, with `RETRY_WAIT` (exponential backoff + jitter for network/5xx/429), `NEEDS_LOGIN` (draft kept; resumes only for the same user), `NEEDS_REVIEW` (idempotency conflict; scan-pending photos after 4 tries) and `FAILED_WITH_REASON` (never auto-retried). Photos upload first via presigned tickets; only confirmed uploads are attached; the officer can explicitly send text-only. Success is decided from the per-item result of `POST /reports/sync`; an item the server did not mention stays queued. Triggers: Sync now, app open/resume, `online` (a hint only), due retries every 15 s, optional Background Sync via the service worker. Storage quota is shown with warnings, cleanup of synced photos is explicit, unsent evidence is never deleted automatically, and another account's items are hidden (count only). Cached identity is removed on logout.

`public/sw.js` caches only the static assets and `/field` pages for offline start-up, never `/api` or `/health`, and does not `skipWaiting` (an open form is never swapped). Bump `VERSION` on change and ship an IndexedDB migration with a test (`tests/unit/offline-db.test.ts` covers an upgrade with pending operations).

### Language

Notification text is keyed by stable event codes (`src/shared/i18n/notices.ts`). English is built in; a non-English catalogue must be registered explicitly after community/operator review (`registerReviewedCatalog`). Until then the UI shows English and says so. Bhashini text/TTS is a backend adapter (T25) and is not called from the browser.

## Verification performed for this handover

Run on this machine (Windows, Node 26.5, pnpm 10.34.5):

| Check | Result |
|---|---|
| `pnpm lint` (`--max-warnings 0`) | pass |
| `pnpm typecheck` (from a clean `.next`) | pass |
| `pnpm test` | 5 files, 79 tests pass |
| `pnpm build` | pass, 38 routes |
| `python frontend/boundries.py --self-test` and `--root .` | pass |
| `python frontend/workflow.py --dry-run` | plan prints; gates were run individually above |
| Production server smoke (`next start`) | `/login` 200; `/gov`, `/field/queue` redirect to `/login` without a cookie; `/sw.js`, manifest, `/offline` 200 |
| `playwright test --list` | 22 tests (11 × 2 projects) parse; prod-host guard refuses `prod.example.com` |

Unit tests exercise, with only the transport mocked and a fake IndexedDB: persist-before-confirm and restart recovery, duplicate retry / response lost after commit (one report, same operation id), interrupted photo upload resume, text-only fallback, expired session and resume, forbidden/invalid not retried, per-item results including a missing item, scan-pending handling, backoff timing, storage-full error, two users on one device, schema upgrade with pending operations, stale/never-reported GPS wording, route no-path/unknown/exclusion display, and CSV formula-injection guarding.

## Known limits (read before relying on this)

Backend/API gaps that the UI works around honestly (details in `../docs/frontend-gaps.md`): no SSE or alert delivery/acknowledgement service (alerts are computed from current records and say so; TanStack refetch/focus refresh replaces SSE), no live `status_version` on `/network/versions` (route staleness relies on the plan expiry and the server's `STALE_ROUTE_PLAN` check when a decision is recorded), no jurisdiction names, no aggregate/dashboard endpoints (figures are computed client-side from bounded lists and flagged when a server limit truncates them), no road-status history, no weather feed, no identity administration API (so no user-management screen), no per-vehicle "assigned trip" endpoint for drivers.

Not verified: offline behaviour on real target phones, Background Sync (Chromium-only and optional), screen-reader behaviour, colour-contrast under all themes, performance targets (p95), and the full end-to-end suite. WCAG 2.2 AA is a design/testing goal, not a certification.
