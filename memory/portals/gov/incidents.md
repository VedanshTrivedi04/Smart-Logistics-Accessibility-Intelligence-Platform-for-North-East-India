# Gov / Incident Management & Triage Center

- **Route:** /gov/incidents
- **Source:** frontend/src/app/(protected)/gov/incidents/page.tsx
- **Roles / capabilities:** Any government role (no explicit Guard); server scopes data.
- **Status:** done (large component)
- **Last updated:** 2026-09-24

## Purpose
Command center for incidents: filter by severity and lifecycle tab (Active/Monitoring/Resolved/All), select an incident, resolve with a reason, coordination actions.

## Key components / features
- `features/incidents/IncidentCommandCenter.tsx` (1284 lines, mostly inline styles), `IncidentImpact.tsx`, `features/coordination/CoordinationPanel.tsx`.

## Data & API
- GET /api/v1/incidents; POST /incidents/{id}/resolve, /merge
- POST /api/v1/coordination/actions; GET /coordination/summaries

## Behaviour notes
A URL-selected incident id preselects. Contains hard-coded demo terrain metadata (around line 68); verify before making data claims.

## Tests
No page-specific test.

## Known issues / TODO
- Large inline-styled component; candidate for splitting.
