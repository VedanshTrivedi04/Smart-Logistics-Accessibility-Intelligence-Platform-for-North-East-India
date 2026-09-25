# Field / Report an incident

- **Route:** /field/report/new
- **Source:** frontend/src/app/(protected)/field/report/new/page.tsx
- **Roles / capabilities:** Guard `SUBMIT_REPORT` (FIELD_OFFICER, LOCAL_AUTHORITY, ROAD_INSPECTION).
- **Status:** done
- **Last updated:** 2026-09-25

## Purpose
5-step offline-first wizard: What happened, Where, Evidence, How severe, Review and save. Draft autosaves on the device and survives connection loss or restart. Also features multilingual AI voice reporting and YOLOv8 real-time photo verification.

## Key components / features
- `features/field/ReportWizard.tsx` (LocationStep with geolocation, EvidenceStep with media).
- `features/field/VoiceReportSection.tsx` (Bhashini voice recording for hi/bn/en with simulated test audio playback, plus typed regional text translation mode for as/mni).
- `features/field/PhotoHazardPreview.tsx` (YOLOv8m ONNX hazard verification with bounding boxes).
- `features/field/store.ts`, `model.ts`, `sync/engine.ts`, `sync/media.ts`, `sync/transport.ts`.

## Data & API
- POST /api/v1/reports/sync (batch, idempotent)
- POST /api/v1/media/upload-ticket, /media/{id}/confirm
- POST /api/v1/ai/voice-report (multipart ASR + translation + reporting)
- POST /api/v1/ai/verify-photo (multipart CV hazard detection)

## Behaviour notes
Saved-on-device is NOT submitted; the queue sends later. Save is blocked with a 'Fix these before saving' list. Shows an error if IndexedDB is unavailable.

## Tests
`tests/unit/offline-db.test.ts`, `queue-state.test.ts`, `sync-engine.test.ts`; e2e `offline-report-journey.spec.ts`.

## Known issues / TODO
- None recorded.
