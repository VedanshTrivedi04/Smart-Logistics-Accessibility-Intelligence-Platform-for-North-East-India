# Field / Report an incident

- **Route:** /field/report/new
- **Source:** frontend/src/app/(protected)/field/report/new/page.tsx
- **Roles / capabilities:** Guard `SUBMIT_REPORT` (FIELD_OFFICER, LOCAL_AUTHORITY, ROAD_INSPECTION).
- **Status:** done
- **Last updated:** 2026-09-25

## Purpose
5-step offline-first tactical field reporting wizard for Senior Field Officer (Elangbam Meitei) patrolling NH-27/NH-6 lifelines: What happened, Where, Evidence, Passability & Severity, Review and save. Draft autosaves to IndexedDB on device and survives offline restarts.

## Key components / features
- `features/field/ReportWizard.tsx`: 5-step responsive wizard with step header, progress indicator, and validation gating.
  - **Step 1 (What happened):** 9 hazard tile cards (including `OBSTRUCTION`, `LANDSLIDE`, `FLOODING`, `BRIDGE_COLLAPSE`) with visual color badges and accessible radio inputs. Reads `?type=` query parameter for pre-filling from `/field` home shortcut chips.
  - **Step 2 (Where):** Real-time GPS with accuracy badge (`useGeolocation`), mountain corridor snap (`snapToCorridor`) projecting exact chainage (e.g. `NH-6 · KM 12.4`), mountain canyon milestone fallback picker (`CORRIDOR_MILESTONES`), interactive map pick, candidate road edge selector (`useEdges`), and duplicate proximity alert (same report type, not REJECTED, observed within 24 h, within ~1.5 km; reads the `GET /reports` array).
  - **Step 3 (Evidence):** Hardware camera capture (`capture="environment"`), gallery picker, photo thumbnail strip with delete actions. Photo is strictly optional (never blocks submission in urgent zero-connectivity conditions). Simulated camera exists only when `NODE_ENV === "development"` (never in production builds), watermarks the image "NOT EVIDENCE", and marks the report (`simulatedEvidence`) so the description header reads "DEMO: SIMULATED EVIDENCE".
  - **Step 4 (Passability & Severity):** Four-level severity (LOW, MEDIUM, HIGH, CRITICAL), Lane status selector (`BOTH_BLOCKED`, `SINGLE_LANE_OPEN`, `SHOULDER_ONLY`, `CLEAR`), Passable vehicle class multiselect (`HEAVY_TRUCK`, `LIGHT_4X4`, `EMERGENCY_ONLY`, `NONE`), and Life-safety risk toggle.
  - **Step 5 (Review and save):** Observed time presets (`Just now`, `15m`, `30m`, `1h`, `Custom`), quick note chips (`Rocks continuing to fall`, `River overflowing road`, `Bridge cracked`, etc.), passability dossier review, and instant IndexedDB queue submission.
- `features/field/model.ts`: Extended payload with `laneStatus`, `passableClasses`, `lifeSafetyRisk`. `formatStructuredDescription` prepends a text header `[LANE: ... · PASSABLE: ... · LIFE-SAFETY: ...]` to `description` for consumers that only read text (existing headers are stripped first, so they never stack). The same values are sent as structured fields and stored by the server. `validatePayload` counts the header toward the 2000-character limit.
- `features/field/store.ts`, `sync/engine.ts`, `sync/media.ts`, `sync/transport.ts`.

## Data & API
- GET /api/v1/reports (proximity duplicate detection within ~1.5 km)
- GET /api/v1/network/edges (candidate road edge selection)
- POST /api/v1/reports/sync (idempotent batch sync; `lane_status`, `passable_classes`, `life_safety_risk` are stored on the report, plus the formatted description)
- POST /api/v1/media/upload-ticket, /media/{id}/confirm (background media upload)

## Behaviour notes
- Saved-on-device queues to IndexedDB immediately; background sync engine transmits once online.
- Save button is blocked until required fields pass `validatePayload` validation.
- Photo is optional; field officers are never stranded if camera permissions or weather impede photo capture.

## Tests
- `tests/unit/offline-db.test.ts`, `queue-state.test.ts`, `sync-engine.test.ts`, `corridors.test.ts`, `report-payload.test.ts` (header, validation, batch item).
- Backend: `tests/unit/reporting/test_report_passability.py`.
- e2e `offline-report-journey.spec.ts` selectors were updated for the new wizard but NOT run (needs production build and seeded backend).

## Known issues / TODO
- The life-safety flag is stored and shown to reviewers only. It does not raise an alert queue or dispatch anything (UI copy says so).
- No ACCIDENT report type (only OBSTRUCTION was added).
- Wizard not checked in a browser at 390 px.
- Voice note recording (Bhashini integration) and automatic photo GPS watermarking deferred to Phase 2.
