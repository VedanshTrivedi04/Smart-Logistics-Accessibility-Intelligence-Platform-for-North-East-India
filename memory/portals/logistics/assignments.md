# Logistics / Fleet Assignments & Dispatch Desk

- **Route:** /logistics/assignments
- **Source:** frontend/src/app/(protected)/logistics/assignments/page.tsx
- **Roles / capabilities:** `DISPATCH_ROUTE` (Fleet Manager, Delivery Coordinator)
- **Status:** done
- **Last updated:** 2026-09-27

## Purpose
Unified operational workspace for matching pending delivery consignments to vehicles and drivers, scheduling departure/arrival windows, and launching trips. Replaces the legacy `/logistics/manage` form flow.

## Key components / features
- `features/fleet/AssignmentsView.tsx` – 4 functional desks:
  - 1. Guided Assignment Wizard: 3-step interactive matching (Pick Pending Consignment -> Vehicle & Driver Availability Check -> Schedule & Dispatch)
  - 2. Consignment Intake: Form to record new delivery consignments (`CreateCommitmentForm`)
  - 3. Multi-Stop Planner: Custom itinerary planner with waypoints (`DispatchTripForm`)
  - 4. AI Optimizer: Embedded `DispatchOptimizer` with 1-click `ApplyDispatchPlanRow`

## Data & API
- GET /api/v1/logistics/commitments
- GET /api/v1/logistics/vehicles
- GET /api/v1/logistics/drivers
- GET /api/v1/logistics/trips
- GET /api/v1/facilities
- POST /api/v1/logistics/commitments
- POST /api/v1/logistics/trips

## Behaviour notes
Client-side conflict avoidance hides busy vehicles/drivers while server-side `DispatchTripUseCase` atomically enforces double-booking prevention.

## Tests
- `tests/integration/logistics/test_fleet_dispatch.py` (overweight, capacity, and double-booking guard).
