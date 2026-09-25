# Gov / Command overview

- **Route:** /gov
- **Source:** frontend/src/app/(protected)/gov/page.tsx
- **Roles / capabilities:** Government surface roles (Regional/State authority, District verifier, Emergency coordinator, Platform admin). Sections adapt to capabilities.
- **Status:** done
- **Last updated:** 2026-09-25

## Purpose
Situational overview: open-road ratio, active/critical incidents, isolated facilities, notices, fleet GPS staleness, global search, CSV briefing export.

## Key components / features
- `features/overview/GovOverview.tsx`, `GlobalSearch.tsx`.
- Hooks from network, incidents, impact, fleet, hazard, alerts.
- `useScopeFilter` for State Authority role adaptation (Assam State Department of Transport).

## Data & API
- edges, facilities, risk-zones, incidents, reports, impacts, fleet vehicles/trips/commitments (see [[shared/features-network]], [[shared/features-incidents]]).

## Behaviour notes
Every figure is computed from records the server returned for the user's scope. Briefing CSV contains aggregate metrics only.
- **State Authority:** When logged in as State Authority (e.g., Bhaskar Singh / Assam), the overview displays a State Authority Command Header scoped to Assam (`[89.7, 24.1, 96.0, 28.0]`) with an interactive toggle to expand to full regional view.
- **District Officer:** When logged in as District Verifier (e.g., Chitralekha Devi / Kamrup Metropolitan), the overview displays an emerald District Officer Command Header scoped to Kamrup Metropolitan (`[91.50, 25.95, 91.98, 26.35]`) with live metrics and map bounded to the district and its 6 administrative circles.

## Tests
No page-specific test.

## Known issues / TODO
- None recorded.
