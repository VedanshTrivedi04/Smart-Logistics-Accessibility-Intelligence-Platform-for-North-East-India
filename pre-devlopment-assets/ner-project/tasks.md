# Dependency-ordered implementation plan

## Scheduling assumptions

Target: a pilot MVP in approximately 12 weeks with backend and frontend engineers plus part-time GIS/domain/QA support. This is an estimate; data access and operator availability may dominate elapsed time. Do not interpret it as a 12-week all-NER production rollout. Public portal, mature ML, autonomous operations and full inventory management are excluded.

Every task starts as NOT STARTED. Dependencies below are finish-to-start unless the task explicitly uses a frozen mock contract. Backend and frontend can work concurrently after OpenAPI fixtures are approved. Owners are responsibilities, not named people.

## Backlog

| Task / owner / estimate | Dependencies and deliverable | Acceptance gate |
|---|---|---|
| T00 Product + domain, 2-3 days | Approve pilot corridor, alternates, users, facilities, status authority and demo scenario | Written scope, role matrix, known data gaps and sign-off |
| T01 Backend + frontend, 2 days | T00; lock stack versions, extension/PWA spike, repo/CI skeleton | FastAPI schema export, Next build, PostGIS/pgRouting query and target-browser storage smoke test |
| T02 GIS/data, 3-5 days plus access waiting | T00; provider/license register and actual samples | Weather/GPS/map source contract per adapter; fixtures marked synthetic if access absent |
| T03 Backend, 3 days | T01; identity, session/CSRF, grants and runtime DB role | Negative scope tests through list/detail, identity expiry and transaction-context reset |
| T04 Backend + GIS, 4-6 days | T01,T02; graph/facility/status schema and Alembic migrations | Fresh/upgrade migration tests, valid geometries, topology and bridge mapping fixtures |
| T05 Frontend, 3-4 days | T01,T03; shared shell and role-aware navigation | Unauthorized pages do not disclose data; loading/error/empty/list alternatives |
| T06 Backend, 3-4 days | T03,T04; reports, media lifecycle, idempotency and sync API | Duplicate replay returns same report; key mismatch rejected; media ownership verified |
| T07 Frontend, 5-7 days | T05,T06 contract; IndexedDB field capture and queue | Offline capture, restart recovery, network retry, auth expiry and storage-full tests |
| T08 Backend + domain, 3-4 days | T06; reviews, status decisions, audit/outbox | Self-review forbidden; stale review conflicts; closure/reopening authority tests |
| T09 Frontend, 3 days | T05,T08 contract; district review/evidence workflow | Review reasons, stale version recovery and evidence/privacy behavior |
| T10 Backend + GIS, 4-6 days | T04,T08; deterministic constrained routes | Directed/bridge/closure restrictions, no-path, ambiguous snap and stale-plan tests |
| T11 Backend, 3-4 days | T03,T04; vehicle, trip, stop and delivery contracts | Ownership tests, assignment conflict, lifecycle and immutable route-plan links |
| T12 Backend/data, 3-4 days | T02,T11; GPS adapter plus labelled replay simulator | Credential/replay checks; old fixes cannot overwrite current; stale marker contract |
| T13 Backend/data, 3 days | T02,T04; weather/CAP adapters and source-health views | Units, expiry, missing values, dedup/update/cancel and outage contract tests |
| T14 Backend, 3-4 days | T08,T10,T11; incident-to-impact worker | Exact distinct trip/delivery/facility impact, older event cannot replace latest |
| T15 Backend, 3 days | T14; scoped alert engine, acknowledgements and escalation | Duplicate processing does not duplicate alert; audience tests; provider failures visible |
| T16 Frontend, 4-5 days | T10,T11,T12,T14 contracts; fleet, delivery and route screens | Stale GPS, no-path, snapshot explanation and explicit dispatch decision UI |
| T17 Frontend, 3-4 days | T09,T13,T14,T15; government map/impact and emergency mode | Coverage denominator, source age, partial data and emergency scope verified |
| T18 Backend + frontend, 2-3 days | T15,T17; SSE with polling/resync fallback | Disconnect/reconnect/dedup, session revocation and cursor expiry tests |
| T19 Frontend + domain, 2-3 days | T07,T16,T17; language templates and accessibility | English + approved pilot language notifications; no color-only status; keyboard journey |
| T20 QA + backend, 3-4 days | T07-T19; end-to-end fault and load tests | Pilot p95 targets measured or exceptions resolved; zero hard-closure traversal |
| T21 Operations + security, 3-4 days | T03,T20; privacy/license review, backup and restore | Restore drill within agreed RPO/RTO; no severe unresolved security issue |
| T22 Product + operators, 2-3 days | T21; supervised pilot rehearsal and decision receipts | Closed-loop scenarios signed off; honest limitations displayed |
| T23 Backend + frontend, optional 3-5 days | T22; snapshot what-if and reachability refinement | Scenario never mutates live status; snapshot replay stable |
| T24 Data/ML, later separate estimate | T02,T12,T13,T22 plus usable labels | Dataset audit, leakage checks, baseline comparison and shadow deployment approval |
| T25 Backend, 2-3 days | T15; Bhashini adapter + template translation
pipeline | Coverage/fallback tests for unsupported language codes; reviewed
template sign-off before send |

Estimates are engineering workdays and overlap across owners. They do not include unbounded government approval/procurement waiting. Re-estimate after T02 and T10; these are the largest uncertainty points.

## Milestones

| Window | Focus | Exit evidence |
|---|---|---|
| Weeks 1-2 | T00-T05: scope, access spike, schema and identity | Approved pilot and honest data availability register |
| Weeks 3-4 | T06-T09: offline report-to-verified-status vertical slice | One durable report despite repeated sync; audited closure |
| Weeks 5-6 | T10-T13: routing, logistics, telemetry and weather | Hard constraints and source freshness visible |
| Weeks 7-8 | T14-T18: impact, alerts and role-specific action | One event yields correct scoped operational effects |
| Weeks 9-10 | T19-T20: multilingual/accessibility and failure testing | Target-device offline evidence and benchmark report |
| Weeks 11-12 | T21-T22: security, restore and supervised rehearsal | Signed pilot gate; no claim of region-wide readiness |

A useful early demonstration is available at the end of week 4. It must be labelled a reporting/verification prototype, not a complete smart logistics system.

## Release scenario suite

S01 Happy path: officer saves a synthetic landslide observation offline, attaches a small photo, reconnects, reviewer confirms a mapped edge closure, affected medicine commitment appears and dispatcher sees an allowed alternative.

S02 No path: all admissible alternatives are closed or incompatible. The platform returns NO_FEASIBLE_PATH, escalates to an operator and does not suggest crossing a forbidden edge.

S03 Unknown: bridge limit or network linkage is missing. The platform returns INSUFFICIENT_DATA or requests qualified review, not an invented safe route.

S04 Repeated sync: response lost after commit; two retries with the same operation create one report, one logical event chain and one deduplicated alert.

S05 Conflicting observations: one new OPEN report and an existing verified BLOCKED state. The edge does not reopen automatically; a conflict review is visible.

S06 Concurrent verification: two verifiers act on the same version. One commits; the other receives 412 and reviews current evidence rather than overwriting.

S07 Stale feeds: weather unavailable and GPS old. Dashboard clearly shows ages/coverage, does not animate the vehicle as live and retains safe degraded behavior.

S08 Cross-scope attack: a fleet user guesses another organization's report, trip, media, export or SSE event identifier. No unauthorized data is disclosed.

S09 Interrupted photo: upload fails after text report. A valid text-only urgent report remains available; later attachment requires ownership and scanning.

S10 Auth expiry: a field draft survives app resume but cannot sync under another account. Re-authentication returns to the proper queue.

S11 Worker failure: queue disappears after committed closure. Outbox replay rebuilds effects without older events replacing newer state.

S12 Reopening: fresh inspection plus authorized decision creates OPEN with new version; old incident/dispatch/audit records remain intact.

S13 Scenario branch: hypothetical 12-hour closure changes only scenario results, never live road accessibility.

S14 Restore: recover database and media references to the agreed point, replay pending events and document any real loss interval.

## Definition of done

A task is done only when its schema/API/UI contracts agree, migrations are safe, authorization and failure tests pass, metrics are added where relevant, fixtures are labelled, and handover documents reflect actual behavior. A green unit-test run alone is not pilot acceptance. Record unexecuted tests honestly.

## Post-pilot growth order

First validate operator usefulness and data coverage. Next add critical-facility isolation and what-if comparison, then inventory-aware priority if trustworthy stock data exists. Expand districts only with topology/status authority validation. Train ML only once labels and evaluation support it. Consider public summaries last, with delayed/coarsened data and a separate privacy/security review.

