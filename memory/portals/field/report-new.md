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
  - **Step 1 (What happened):** Multilingual voice report section (Bhashini ASR + translation) and 9 hazard tile cards (`OBSTRUCTION`, `LANDSLIDE`, `FLOODING`, `BRIDGE_COLLAPSE`) with visual color badges. Reads `?type=` query parameter for pre-filling.
  - **Step 2 (Where):** Real-time GPS with accuracy badge (`useGeolocation`), mountain corridor snap (`snapToCorridor`) projecting exact chainage (e.g. `NH-6 · KM 12.4`), mountain canyon milestone fallback picker (`CORRIDOR_MILESTONES`), interactive map pick, candidate road edge selector (`useEdges`), and duplicate proximity alert.
  - **Step 3 (Evidence):** Hardware camera capture, gallery picker, photo thumbnail strip with delete actions, and real-time YOLOv8m photo hazard preview (`PhotoHazardPreview.tsx`). Photo is strictly optional (never blocks submission).
  - **Step 4 (Passability & Severity):** Four-level severity (LOW, MEDIUM, HIGH, CRITICAL), Lane status selector (`BOTH_BLOCKED`, `SINGLE_LANE_OPEN`, `SHOULDER_ONLY`, `CLEAR`), Passable vehicle class multiselect (`HEAVY_TRUCK`, `LIGHT_4X4`, `EMERGENCY_ONLY`, `NONE`), and Life-safety risk toggle.
  - **Step 5 (Review and save):** Observed time presets, quick note chips, passability dossier review, and instant IndexedDB queue submission.
- `features/field/VoiceReportSection.tsx`: Bhashini voice recording for hi/bn/en with simulated test audio playback, plus typed regional text translation mode for as/mni.
- `features/field/PhotoHazardPreview.tsx`: YOLOv8m ONNX hazard verification with bounding boxes.
- `features/field/model.ts`: Extended payload with `laneStatus`, `passableClasses`, `lifeSafetyRisk`. `formatStructuredDescription` prepends a text header `[LANE: ... · PASSABLE: ... · LIFE-SAFETY: ...]`.
- `features/field/store.ts`, `sync/engine.ts`, `sync/media.ts`, `sync/transport.ts`.

## Data & API
- GET /api/v1/reports (proximity duplicate detection within ~1.5 km)
- GET /api/v1/network/edges (candidate road edge selection)
- POST /api/v1/reports/sync (idempotent batch sync)
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
