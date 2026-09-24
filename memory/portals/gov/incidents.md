# Gov / Incident Management & Triage Center

- **Route:** /gov/incidents
- **Source:** frontend/src/app/(protected)/gov/incidents/page.tsx
- **Roles / capabilities:** Any government role (no explicit Guard); server scopes data.
- **Status:** done
- **Last updated:** 2026-09-24

## Purpose
Command center for incidents: filter by severity and lifecycle tab (Active/Monitoring/Resolved/All), select an incident, inspect supply chain impacts (trips, deliveries, facilities), review event timeline, resolve with a verified reason, coordinate multi-agency response, and deep-link directly to source field observations and forensic ground evidence.

## Key components / features
- `features/incidents/IncidentCommandCenter.tsx`:
  - Live triage counter cards (Critical, High, Moderate, Resolved).
  - Search and filter pills for incident lifecycle.
  - Incident details dossier with verified ground observation, road impact, and direct navigation link to `/gov/reports?selected={primary_report_id}`.
  - Disruption impact breakdown (affected trips, delivery commitments, critical facilities).
  - Chronological response timeline (Reported → Reviewed → Verified → Road Blocked → Impact Calculated).
  - Resolution modal with reason codes and notes.
- `IncidentImpact.tsx`, `features/coordination/CoordinationPanel.tsx`.

## Data & API
- GET `/api/v1/incidents`; POST `/incidents/{id}/resolve`, `/merge`
- GET `/api/v1/reports/{report_id}` (for primary report ground inspection data)
- POST `/api/v1/coordination/actions`; GET `/coordination/summaries`

## Behaviour notes
- Bidirectionally cross-linked with `/gov/reports`: selecting an incident allows one-click drill down into the originating field report `#FR-XXXX` and photographic evidence.
- A URL-selected incident id preselects via `?selected={incident_id}`.

## Tests
- No page-specific test.

## Known issues / TODO
- None recorded.
