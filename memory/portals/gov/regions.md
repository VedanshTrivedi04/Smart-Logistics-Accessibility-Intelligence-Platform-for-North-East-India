# Gov / States (state-wise view)

- **Route:** /gov/regions
- **Source:** frontend/src/app/(protected)/gov/regions/page.tsx
- **Roles / capabilities:** Guard `VIEW_REGION` or `VIEW_IMPACT` (any-of).
- **Status:** done (new 2026-09-24)
- **Last updated:** 2026-09-25

## Purpose
Regional Commander view: compare NER states by incidents, roads, facilities and logistics, most affected first; drill into one state.

## Key components / features
- `features/regions/RegionalBreakdown.tsx`, `breakdown.ts`.
- `features/coordination` for the jurisdiction index.
- `useScopeFilter` for State Authority banner and assigned jurisdiction highlighting.

## Data & API
- GET /api/v1/jurisdictions
- edges, facilities, incidents, reports, impacts

## Behaviour notes
Incident state comes from its report; roles without report visibility see an 'Incidents cannot be placed' banner. Items with no state are listed as 'Not placed'.
- **State Authority:** For State Authority users (e.g. Bhaskar Singh), displays an authoritative state jurisdiction banner, highlights the Assam row with a distinctive `★ YOUR JURISDICTION` badge and direct "Focus on Assam" action.
- **District Officer:** For District Verifier users (e.g. Chitralekha Devi), displays an emerald banner with an operational sub-division switcher (`CIRCLES` vs `REGIONAL_COMPARISON`). Features a detailed **District Circles & Sub-divisions Operational Breakdown** table detailing all 6 administrative circles of Kamrup Metropolitan (Guwahati Urban, Dispur Capital, Azara Airport, Sonapur Frontier, North Guwahati Saraighat, Chandrapur Riverine) with verified road lengths, pending verification counts, active disruptions, and circle status.

## Tests
`tests/unit/regions-coordination.test.ts`.

## Known issues / TODO
- None recorded.
