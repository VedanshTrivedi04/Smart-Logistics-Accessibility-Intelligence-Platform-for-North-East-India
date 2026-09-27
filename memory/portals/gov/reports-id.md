# Gov / Review report

- **Route:** /gov/reports/[id]
- **Source:** frontend/src/app/(protected)/gov/reports/[id]/page.tsx
- **Roles / capabilities:** Guard `VIEW_REPORT_DETAIL`; verifying needs `VERIFY_REPORT` (DISTRICT_VERIFIER) or `OVERRIDE_VERIFICATION` (STATE_AUTHORITY).
- **Status:** done
- **Last updated:** 2026-09-27 (fix pass)

## Purpose
Check evidence, then verify, request more info, or reject with a reason. Features AI Visual Triage Dossier summarizing automated YOLOv8 CV hazard predictions, and a dedicated [🔬 Dispatch Road Inspector] action to deploy senior engineering inspectors to critical or caution-flagged incidents. A user cannot review their own report.

## Key components / features
- `features/incidents/ReportReview.tsx`, `evidence.tsx` (media via presigned URL).
- `features/incidents/AiVisualTriageDossier.tsx` (AI triage dossier, hazard confidence indicators, 1-click verification).
- `features/inspection/AssignInspectionModal.tsx` (modal for assigning senior inspectors, setting priority, and issuing technical instructions). Fixed 2026-09-27: previously offered one hardcoded inspector `<option>` and defaulted `jurisdictionId` to the literal string `"DIST_KAMRUP"` regardless of the report's actual jurisdiction. Now calls `useAvailableInspectors()` (`GET /api/v1/inspections/inspectors`, backed by `list_available_inspectors()` — see [[backend-inspection]]) to populate a real roster of `ROAD_INSPECTION` users, and requires a real `jurisdictionId` prop with no default; if the report has none, the modal shows a warning banner and disables submit rather than silently mis-assigning the jurisdiction.

## Data & API
- GET /api/v1/reports/{id}
- POST /reports/{id}/triage, /reports/{id}/review
- POST /api/v1/inspections (dispatch inspector)
- POST /api/v1/ai/auto-triage-report (AI automated photo triage)
- GET /media/{id}/download

## Behaviour notes
Own-report rule is enforced server-side; UI shows a notice. Roles without verify get a 'View only' banner.

## Tests
No page-specific test.

## Known issues / TODO
- None recorded.
