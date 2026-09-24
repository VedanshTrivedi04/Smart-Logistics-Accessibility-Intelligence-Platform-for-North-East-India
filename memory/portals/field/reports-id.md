# Field / Report status

- **Route:** /field/reports/[id]
- **Source:** frontend/src/app/(protected)/field/reports/[id]/page.tsx
- **Roles / capabilities:** Field surface: FIELD_OFFICER, LOCAL_AUTHORITY, ROAD_INSPECTION.
- **Status:** done
- **Last updated:** 2026-09-24

## Purpose
Status of one report; warns when a reviewer requested more information.

## Key components / features
- `ReportStatusDetail` in `features/field/views.tsx`.

## Data & API
- GET /api/v1/reports/{report_id}

## Behaviour notes
`isUuid` check -> `notFound()` for bad ids.

## Tests
No page-specific test.

## Known issues / TODO
- None recorded.
