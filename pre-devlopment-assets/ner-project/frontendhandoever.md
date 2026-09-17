# Frontend engineering handover

## Current handover state

Delivered: screen architecture, contract expectations, offline protocol, acceptance plan and Python development check scripts. No Next.js application or rendered UI is included. Next.js/React/TypeScript implement the actual frontend; frontend/workflow.py and frontend/boundries.py only support repository checks.

Use one Next.js app with government, field and logistics route segments, shared design primitives and role-aware navigation. FastAPI remains the authority for authentication context, permissions, road status and dispatch decisions. Hidden navigation is convenience, not authorization.

## Screen inventory

| Surface | Screens | Essential interactions |
|---|---|---|
| Shared | Login/session expiry, account/scope, forbidden, degraded service | Clear identity and permission context |
| Government | Command overview, accessibility map/list, incident queue/detail | Filter by permitted jurisdiction; see freshness/coverage |
| Government | Review decision, impact details, alerts, emergency mode | Verify with reason; assign and acknowledge actions |
| Government | Route/scenario comparison, operational reports | Explain alternatives and show snapshot validity |
| Field | Home, report capture, camera/location, draft review | Large touch controls; manual coordinates if permission denied |
| Field | Queue, report detail/status, nearby scoped alerts | Explicit save/sync/error/needs-login states |
| Logistics | Fleet map/list, vehicle detail, deliveries and trip detail | Distinguish observed GPS from stale location |
| Logistics | Route alternatives and dispatch decision, alerts/history | Review changed plans and record authorized decisions |

Emergency mode changes presentation and prioritization only. No public route or unauthenticated vehicle map is part of MVP.

## Module structure and dependencies

Use src/app for layouts/routes and composition; src/features/<feature> for domain-specific screens and interactions; src/shared for UI, generated API transport, authentication primitives, map rendering and generic offline utilities. Export cross-feature capabilities from index.ts. Do not import another feature's private components/hooks. Keep route-specific business code out of generic shared UI.

MapLibre and IndexedDB/browser APIs live in client components. Avoid importing them during server rendering. Render an accessible list when maps fail or load slowly. Do not pass secrets or unfiltered backend objects from server components to client props. Use a licensed tile endpoint; never implement offline packs against the standard OSM tile service.

## API client and data ownership

Generate TypeScript types/client from the backend OpenAPI artifact under contracts/. Freeze representative success/error fixtures before building screens. API transport uses same-origin /api/v1 through the reverse proxy, secure session cookies and a CSRF header for unsafe methods. Do not store access/refresh tokens in localStorage.

TanStack Query owns server-resource caching. Include active identity, organization/scope and resource filters in cache keys. Clear protected cached data on logout, scope change or session revocation. SSE invalidates resources; REST remains canonical. Do not maintain a second mutable road-status store in React state.

Use UI state for view controls, drafts and optimistic progress only. Never optimistically display VERIFIED, reopened OPEN, DELIVERED or accepted dispatch before server confirmation. A local report shows Saved on device rather than Submitted until accepted.

## Required component language

StatusBadge has label plus icon/text, not color alone. EvidencePanel distinguishes observation, verification, hazard and freshness. SourceAge shows observed_at and received_at when relevant. RouteExplanation shows hard exclusions, model/rules label, stale inputs and policy/snapshot version. CoverageBanner states which facilities/roads are known. SyncQueue exposes each pending operation and its remedy.

Use human-readable statements such as Last GPS update 12 minutes ago and Road condition unknown; verification required. Never call all markers live, say safe route or replace a missing ETA with zero. Unknown, no feasible route and service error need different UI states.

## Offline implementation contract

Persist drafts and operation metadata in IndexedDB before confirming local save. Proposed object stores: drafts, operations, local_media and sync_metadata, scoped by identity. Version the schema and test migration with pending operations before shipping service-worker updates.

Queue flow is DRAFT -> QUEUED -> UPLOADING_MEDIA -> SUBMITTING -> SYNCED, with RETRY_WAIT, NEEDS_LOGIN, NEEDS_REVIEW and FAILED_WITH_REASON branches. Upload media first or let the user submit a text-only urgent report; never attach unowned incomplete objects. Keep operation IDs stable across retries. Use server per-item results rather than guessing success from overall batch HTTP status.

Triggers: explicit Sync button, app resume, validated network recovery and optional supported Background Sync. navigator.onLine is only a hint; use actual request outcomes. Exponential backoff with jitter applies to transient failures; do not endlessly retry a forbidden/invalid payload. Preserve a draft on auth expiry and ask the same user to sign in before replay.

Display storage quota warnings and explicit cleanup for synced media. Never silently delete unsent evidence to free space. Browser storage may be evicted; communicate offline limitations. On logout, separately handle unsynced content and cached server data so one device user cannot read another's queue. Sensitive deployments need managed-device safeguards.

## Map and routing behavior

Fetch bounded viewport data, simplify at low zoom and cluster vehicle/incident points. Retain source attribution. Map selection links to an accessible side panel/list item with the same content. Render stale GPS with a distinct symbol and age; do not extrapolate observed movement. A blocked edge must remain visually different from a weather-risk overlay.

Show route alternatives with estimated time, reason, missing constraints, expiry and snapshot identity. If a newer road-status version arrives, mark the recommendation outdated and require recomputation before acceptance. A NO_FEASIBLE_PATH response presents escalation instructions configured by the operator, not an invented contact number or auto-generated detour.

## Language and accessibility

MVP notification templates support English and one pilot-approved local language chosen with actual users; do not assume Hindi covers all intended recipients. Keep event codes independent of translated text. Use reviewed templates for emergency language rather than free-form machine translation as the sole official wording. Test font rendering, place-name length and offline template availability.
MVP notification templates support English and pilot-approved local
language(s) delivered through Bhashini text/TTS APIs; do not assume Hindi
covers all intended NER recipients. For languages outside Bhashini's 22
scheduled languages, use icon/voice fallback and community-reviewed templates
rather than unreviewed machine translation.

Target WCAG 2.2 AA as a design/testing goal, not an unverified certification. Provide keyboard access, visible focus, labels/errors, text alternatives, sufficient contrast, screen-reader status announcements and map/list parity. Avoid relying on drag gestures alone. Low-bandwidth mode prioritizes text and defers nonessential images.

## Frontend package scripts

Create package.json scripts named lint, typecheck, test, test:e2e and build; workflow.py runs them through pnpm with shell execution disabled. Pin packageManager and commit pnpm-lock.yaml. test must run once, not watch forever. test:e2e must start or connect to a documented test server with synthetic data and never point at production.

Suggested tools: ESLint, TypeScript strict checks, Vitest/Testing Library, Playwright and an accessibility checker. Validate the actual versions together before locking. Import boundaries should also be enforced with ESLint; the included Python checker deliberately covers only common syntax and is not a TypeScript compiler.

## Test scenarios

Exercise the field journey with network disabled, app reload and restored network; server response lost after commit; interrupted photo upload; outdated service worker and schema upgrade; expired session; storage quota reached; two users on one device; denied geolocation; stale API response; wrong organization; keyboard-only review; no-path route; and SSE gap requiring a full resync.

Use a fake clock and labelled fixtures for deterministic freshness and expiry tests. Mock only the transport boundary and keep payloads matched to OpenAPI; at least one end-to-end suite uses real FastAPI/PostGIS test services. Verify status text, not only marker colors or screenshot appearance.

## Frontend handover acceptance

Receiving engineer can install locked packages, generate the API client, run all scripts, navigate the three role surfaces with scoped fixture users, capture a report offline, synchronize exactly once, review it through the government view and see a permitted logistics impact. Document target devices/browsers and tests actually executed. Screenshots alone do not establish offline correctness or access isolation.
