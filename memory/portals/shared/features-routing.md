# Shared / Feature: routing

- **Last updated:** 2026-09-24

- **Source:** frontend/src/features/routing/*, app/RouteTool.tsx
- **Used by:** [[public/home]], [[gov/routes]], [[logistics/routes]], [[gov/emergency]]
- **Status:** done

- `RouteEvaluator` (origin/destination via map or address, vehicle weight/height/hazmat, policy comparison), `RoutePlanView` (options, explanation, `DispatchDecisionForm`), `DirectionsList` + `directions.ts` (turn list from plan), `ElevationProfile` (577 lines), `AddressSearch`, `PublicRouteCheck`.
- A route plan snapshot expires; the decision form refuses expired recommendations.
- Backend: [[shared/backend-routing]], [[shared/backend-public]].
