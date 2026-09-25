# Gov / Route intelligence

- **Route:** /gov/routes
- **Source:** frontend/src/app/(protected)/gov/routes/page.tsx
- **Roles / capabilities:** Guard `COMPUTE_ROUTE` (FLEET_MANAGER, DELIVERY_COORDINATOR baseline). Advisory directive: `DISPATCH_DECISION`.
- **Status:** done
- **Last updated:** 2026-09-24

## Purpose
Explain alternatives, compare policies, see when a snapshot stops being valid. Also embedded directly inside `/gov/impact` as the Embedded Route Intelligence Studio for zero-navigation disruption resolution.

## Key components / features
- `app/RouteTool.tsx` -> `features/routing/RouteEvaluator.tsx` (compare mode), `RoutePlanView.tsx`.
- Integrated directly into `features/impact/ImpactCommandCenter.tsx` for fast convoy rerouting.

## Data & API
- POST /api/v1/routes/evaluate, GET /routes/{id}, POST /trips/{id}/dispatch-decisions

## Behaviour notes
Query params prefill destFacilityId, vehicleId, originLat/originLon. A recommendation expires and must be recomputed. Human-in-the-loop validation: Regional Commander advises/recommends, no automated diversion without authorization.

## Tests
No page-specific test.

## Known issues / TODO
- None recorded.

