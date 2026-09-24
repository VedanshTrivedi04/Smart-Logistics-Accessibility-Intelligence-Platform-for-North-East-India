# Gov / States (state-wise view)

- **Route:** /gov/regions
- **Source:** frontend/src/app/(protected)/gov/regions/page.tsx
- **Roles / capabilities:** Guard `VIEW_REGION` or `VIEW_IMPACT` (any-of).
- **Status:** done (new 2026-09-24)
- **Last updated:** 2026-09-24

## Purpose
Regional Commander view: compare NER states by incidents, roads, facilities and logistics, most affected first; drill into one state.

## Key components / features
- `features/regions/RegionalBreakdown.tsx`, `breakdown.ts`.
- `features/coordination` for the jurisdiction index.

## Data & API
- GET /api/v1/jurisdictions
- edges, facilities, incidents, reports, impacts

## Behaviour notes
Incident state comes from its report; roles without report visibility see an 'Incidents cannot be placed' banner. Items with no state are listed as 'Not placed'.

## Tests
`tests/unit/regions-coordination.test.ts`.

## Known issues / TODO
- None recorded.
