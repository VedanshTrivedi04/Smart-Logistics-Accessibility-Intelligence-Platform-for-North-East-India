# Field / Report an incident

- **Route:** /field/report/new
- **Source:** frontend/src/app/(protected)/field/report/new/page.tsx
- **Roles / capabilities:** Guard `SUBMIT_REPORT` (FIELD_OFFICER, LOCAL_AUTHORITY, ROAD_INSPECTION).
- **Status:** done
- **Last updated:** 2026-09-26

## Purpose
5-step offline-first tactical field reporting wizard for Senior Field Officer (Elangbam Meitei) patrolling NH-27/NH-6 lifelines: What happened, Where, Evidence, Passability & Severity, Review and save. Draft autosaves to IndexedDB on device and survives offline restarts. Also features multilingual AI voice reporting and YOLOv8 real-time photo verification.

## Key components / features
- `features/field/ReportWizard.tsx`: 5-step responsive wizard with step header, progress indicator, and validation gating.
  - **Step 1 (What happened):** Multilingual voice report section (Bhashini ASR + translation) and 9 hazard tile cards (`OBSTRUCTION`, `LANDSLIDE`, `FLOODING`, `BRIDGE_COLLAPSE`) with visual color badges. Reads `?type=` query parameter for pre-filling from `/field` home shortcut chips.
  - **Step 2 (Where):** Bounded high-accuracy GPS watch (`useBoundedGeolocation`, locks when accuracy <= 15m or settles after 15s to save battery), honest sensor provider classification (`classifyProvider`: >100m marked `NETWORK_COARSE`, <=100m `GPS_HARDWARE`), gapless accuracy tiering (<=15m Green High-Precision, 16–50m Amber Mountain Canyon, >50m Red Degraded), elapsed fix age counter ("Fixed 12s ago") with instant re-acquire button. Tactical Location HUD displays verified road corridor (`snapToCorridor`), authentic landmark chainage from `corridors.ts`, GPS altitude (`~X m (GPS approx.)`), off-corridor advisory (warning only, never blocks submission), Mountain Carriageway Side selector (`HILLSIDE`, `VALLEY_SIDE`, `BOTH`, `UNKNOWN`), authentic `CORRIDOR_MILESTONES` fallback grid, and manual coordinate inputs accessible in DOM for e2e tests (`offline-report-journey.spec.ts`) and tucked into `<details>` when GPS is locked.
  - **Step 3 (Evidence):** Hardware camera capture (`capture="environment"`), gallery picker, photo thumbnail strip with delete actions, and real-time YOLOv8m photo hazard preview (`PhotoHazardPreview.tsx`). Photo metadata displays draft ref, GPS, blob size. Photo is strictly optional (never blocks submission in urgent zero-connectivity conditions). Simulated camera exists only when `NODE_ENV === "development"` (never in production builds), watermarks the image "NOT EVIDENCE".
  - **Step 4 (Passability & Severity):** Four-level severity (LOW, MEDIUM, HIGH, CRITICAL), Lane status selector (`BOTH_BLOCKED`, `SINGLE_LANE_OPEN`, `SHOULDER_ONLY`, `CLEAR`), Passable vehicle class multiselect (`HEAVY_TRUCK`, `LIGHT_4X4`, `EMERGENCY_ONLY`, `NONE`), and Life-safety risk toggle.
  - **Step 5 (Review and save):** Observed time presets (`Just now`, `15m`, `30m`, `1h`, `Custom`), quick note chips (`Rocks continuing to fall`, `River overflowing road`, `Bridge cracked`, etc.), passability and carriageway side dossier review, and instant IndexedDB queue submission.
- `features/field/VoiceReportSection.tsx`: Bhashini voice recording for hi/bn/en with simulated test audio playback, plus typed regional text translation mode for as/mni.
- `features/field/PhotoHazardPreview.tsx`: YOLOv8m ONNX hazard verification with bounding boxes.
- `features/field/model.ts`: Extended payload with `laneStatus`, `passableClasses`, `lifeSafetyRisk`, and `roadSide`. `formatStructuredDescription` prepends a text header `[LANE: ... · PASSABLE: ... · LIFE-SAFETY: ... · SIDE: ... · ALTITUDE: ...]` to `description` for consumers that only read text. The same values are sent as structured fields and stored by the server.
- `features/field/locationLogic.ts` & `useBoundedGeolocation.ts`: pure functions for provider classification, gapless accuracy tiers, approximate altitude formatting, fix age formatting, and bounded GPS sampling.
- `features/field/store.ts`, `sync/engine.ts`, `sync/media.ts`, `sync/transport.ts`.

## Data & API
- GET /api/v1/reports (proximity duplicate detection within ~1.5 km)
- GET /api/v1/network/edges (candidate road edge selection)
- POST /api/v1/reports/sync (idempotent batch sync; `lane_status`, `passable_classes`, `life_safety_risk`, `road_side`, and `altitude_m` are stored on the report via Migration 011, plus the formatted description)
- POST /api/v1/media/upload-ticket, /media/{id}/confirm (background media upload)
- POST /api/v1/ai/voice-report (multipart ASR + translation + reporting)
- POST /api/v1/ai/verify-photo (multipart CV hazard detection)

## Behaviour notes
- Saved-on-device queues to IndexedDB immediately; background sync engine transmits once online.
- Save button is blocked until required fields pass `validatePayload` validation.
- Photo is optional; field officers are never stranded if camera permissions or weather impede photo capture.

## Tests
- `tests/unit/offline-db.test.ts`, `queue-state.test.ts`, `sync-engine.test.ts`, `corridors.test.ts`, `report-payload.test.ts`.
- Backend: `tests/unit/reporting/test_report_passability.py`.

## Known issues / TODO
- The life-safety flag is stored and shown to reviewers only.
- No ACCIDENT report type (only OBSTRUCTION was added).
- Wizard not checked in a browser at 390 px.
