# Gov / Analytics and reports

- **Route:** /gov/analytics
- **Source:** frontend/src/app/(protected)/gov/analytics/page.tsx
- **Roles / capabilities:** Nav: `VIEW_REPORT_SUMMARY` or `VIEW_FLEET`.
- **Status:** done
- **Last updated:** 2026-09-24

## Purpose
Period analytics (today, 7 days, 30 days, custom) with previous-period comparison and CSV export.

## Key components / features
- `features/analytics/AnalyticsView.tsx`, `periods.ts`.

## Data & API
- incidents, reports, commitments, trips (client-side aggregation).

## Behaviour notes
Warns when the API list limit (LIST_LIMIT) truncated history. Exports omit exact coordinates.

## Tests
`domain-logic.test.ts`.

## Known issues / TODO
- None recorded.
