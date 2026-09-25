# Gov / Review report

- **Route:** /gov/reports/[id]
- **Source:** frontend/src/app/(protected)/gov/reports/[id]/page.tsx
- **Roles / capabilities:** Guard `VIEW_REPORT_DETAIL`; verifying needs `VERIFY_REPORT` (DISTRICT_VERIFIER) or `OVERRIDE_VERIFICATION` (STATE_AUTHORITY).
- **Status:** done
- **Last updated:** 2026-09-25

## Purpose
Check evidence, then verify, request more info, or reject with a reason. Features AI Visual Triage Dossier summarizing automated YOLOv8 CV hazard predictions with 1-click confirmation or override. A user cannot review their own report.

## Key components / features
- `features/incidents/ReportReview.tsx`, `evidence.tsx` (media via presigned URL).
- `features/incidents/AiVisualTriageDossier.tsx` (AI triage dossier, hazard confidence indicators, 1-click verification).

## Data & API
- GET /api/v1/reports/{id}
- POST /reports/{id}/triage, /reports/{id}/review
- POST /api/v1/ai/auto-triage-report (AI automated photo triage)
- GET /media/{id}/download

## Behaviour notes
Own-report rule is enforced server-side; UI shows a notice. Roles without verify get a 'View only' banner.

## Tests
No page-specific test.

## Known issues / TODO
- None recorded.
