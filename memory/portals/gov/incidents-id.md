# Gov / Incident detail

- **Route:** /gov/incidents/[id]
- **Source:** frontend/src/app/(protected)/gov/incidents/[id]/page.tsx
- **Roles / capabilities:** Government roles; report detail needs `VIEW_REPORT_DETAIL`.
- **Status:** done
- **Last updated:** 2026-09-24

## Purpose
Incident detail: location and nearby roads, linked reports, resolve/merge forms, regional impact (affected trips, deliveries, facilities), coordination panel.

## Key components / features
- `features/incidents/IncidentDetail.tsx`, `IncidentImpact.tsx`, `features/coordination/CoordinationPanel.tsx`.

## Data & API
- GET /api/v1/incidents/{id}, /trips/{id}/impacts, /facilities/{id}/impacts
- POST resolve, merge, coordination actions

## Behaviour notes
Resolve/merge are confirmed only after the server responds. Roles without report detail see a limited summary.

## Tests
No page-specific test.

## Known issues / TODO
- None recorded.
