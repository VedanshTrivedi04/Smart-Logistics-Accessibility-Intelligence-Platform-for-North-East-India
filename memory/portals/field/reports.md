# Field / My reports

- **Route:** /field/reports
- **Source:** frontend/src/app/(protected)/field/reports/page.tsx
- **Roles / capabilities:** Nav `VIEW_REPORT_SUMMARY`.
- **Status:** done
- **Last updated:** 2026-09-24

## Purpose
Lists the officer's reports and on-device items, distinguishing 'saved on device' from 'accepted by server'; allows amending a submitted report.

## Key components / features
- `MyReports` in `features/field/views.tsx`.

## Data & API
- GET /api/v1/reports
- POST /api/v1/reports/{id}/amend (immutable correction creates a new report)

## Behaviour notes
Amendment is append-only. Links to `/field/reports/[id]`.

## Tests
No page-specific test.

## Known issues / TODO
- None recorded.
