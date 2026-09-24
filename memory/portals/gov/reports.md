# Gov / Field reports queue

- **Route:** /gov/reports
- **Source:** frontend/src/app/(protected)/gov/reports/page.tsx
- **Roles / capabilities:** Guard `VIEW_REPORT_SUMMARY`.
- **Status:** done
- **Last updated:** 2026-09-24

## Purpose
Queue of field observations filtered by review state (Awaiting review, Provisional caution, Under review, More info needed, Verified, Rejected).

## Key components / features
- `ReportQueue` in `features/incidents/lists.tsx`.

## Data & API
- GET /api/v1/reports

## Behaviour notes
A report is not verified until a reviewer decides.

## Tests
No page-specific test.

## Known issues / TODO
- None recorded.
