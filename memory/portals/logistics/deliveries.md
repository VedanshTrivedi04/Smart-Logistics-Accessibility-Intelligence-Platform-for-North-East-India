# Logistics / Deliveries

- **Route:** /logistics/deliveries
- **Source:** frontend/src/app/(protected)/logistics/deliveries/page.tsx
- **Roles / capabilities:** Logistics surface: FLEET_MANAGER, DELIVERY_COORDINATOR, TRANSPORT_OPERATOR. Guard `VIEW_FLEET`. Baseline roles holding it: REGIONAL_AUTHORITY, EMERGENCY_COORDINATOR, FLEET_MANAGER, DELIVERY_COORDINATOR.
- **Status:** done
- **Last updated:** 2026-09-25

## Purpose
Consignments ordered by priority then deadline, plus Google OR-Tools AI Dispatch Optimizer for multi-stop vehicle routing and capacity scheduling.

## Key components / features
- `DeliveriesView` (tabbed view between active consignments table and AI dispatch optimizer).
- `CommitmentList` (consignments table, filters, CSV export).
- `DispatchOptimizer` (depot hub selection, consignment picking, fleet vehicle selection, OR-Tools CVRP solver execution, itinerary timeline, vehicle load progress visualization).

## Data & API
- GET /api/v1/logistics/commitments
- GET /api/v1/logistics/vehicles
- GET /api/v1/network/facilities
- POST /api/v1/ai/optimize-dispatch (Google OR-Tools CVRP solver)

## Behaviour notes
None beyond the above.

## Tests
No page-specific test.

## Known issues / TODO
- None recorded.
