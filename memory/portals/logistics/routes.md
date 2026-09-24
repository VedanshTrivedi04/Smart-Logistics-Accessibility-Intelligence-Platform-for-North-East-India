# Logistics / Route alternatives

- **Route:** /logistics/routes
- **Source:** frontend/src/app/(protected)/logistics/routes/page.tsx
- **Roles / capabilities:** Guard `COMPUTE_ROUTE`.
- **Status:** done
- **Last updated:** 2026-09-24

## Purpose
Compare route options by time and distance; decisions are recorded from a trip.

## Key components / features
- `app/RouteTool.tsx`, `features/routing/RouteEvaluator.tsx`.

## Data & API
- POST /api/v1/routes/evaluate

## Behaviour notes
None beyond the above.

## Tests
No page-specific test.

## Known issues / TODO
- None recorded.
