# Inspector / Ground Reports Feed

- **Route:** /inspector/reports
- **Source:** frontend/src/app/(protected)/inspector/reports/page.tsx
- **Roles / capabilities:** ROAD_INSPECTION (`VIEW_REPORT_SUMMARY`, `CONDUCT_INSPECTION`)
- **Status:** done
- **Last updated:** 2026-09-27 (fix pass)

## Purpose
Enables Senior Road Inspectors to monitor all incoming ground patrol reports, identify incidents requiring specialized geotechnical or structural inspection, and initiate direct inspection missions.

## Key components / features
- `features/inspection/InspectorReportsView.tsx` - List of field officer reports filtered by review status and severity, quick-search by corridor or description, and direct link to field report details. Fixed 2026-09-27: read `reportsQuery.data` directly (was `.data?.reports`, a field `useReports()` never returns — the list always rendered empty) and `r.media_ids.length` (was `.media_count`, which does not exist on `Report`).

## Data & API
- GET `/api/v1/reports` - fetched via `useReports()`.

## Behaviour notes
- Highlights reports flagged as `PROVISIONAL_CAUTION` or `CRITICAL` requiring urgent technical validation.

## Tests
- Frontend build validation.

## Known issues / TODO
- None.
