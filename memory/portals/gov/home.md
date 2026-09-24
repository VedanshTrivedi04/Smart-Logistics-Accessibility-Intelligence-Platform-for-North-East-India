# Gov / Command overview

- **Route:** /gov
- **Source:** frontend/src/app/(protected)/gov/page.tsx
- **Roles / capabilities:** Government surface roles (Regional/State authority, District verifier, Emergency coordinator, Platform admin). Sections adapt to capabilities.
- **Status:** done
- **Last updated:** 2026-09-24

## Purpose
Situational overview: open-road ratio, active/critical incidents, isolated facilities, notices, fleet GPS staleness, global search, CSV briefing export.

## Key components / features
- `features/overview/GovOverview.tsx`, `GlobalSearch.tsx`.
- Hooks from network, incidents, impact, fleet, hazard, alerts.

## Data & API
- edges, facilities, risk-zones, incidents, reports, impacts, fleet vehicles/trips/commitments (see [[shared/features-network]], [[shared/features-incidents]]).

## Behaviour notes
Every figure is computed from records the server returned for the user's scope. Briefing CSV contains aggregate metrics only.

## Tests
No page-specific test.

## Known issues / TODO
- None recorded.
