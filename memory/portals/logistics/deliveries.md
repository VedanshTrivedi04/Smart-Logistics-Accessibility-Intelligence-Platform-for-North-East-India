# Logistics / Deliveries

- **Route:** /logistics/deliveries
- **Source:** frontend/src/app/(protected)/logistics/deliveries/page.tsx
- **Roles / capabilities:** Logistics surface: FLEET_MANAGER, DELIVERY_COORDINATOR, TRANSPORT_OPERATOR. Guard `VIEW_FLEET`. Baseline roles holding it: REGIONAL_AUTHORITY, EMERGENCY_COORDINATOR, FLEET_MANAGER, DELIVERY_COORDINATOR.
- **Status:** done
- **Last updated:** 2026-09-28

## Purpose
First-class Deliveries & Consignments operations desk within Fleet Operations: multimodal cargo booking, priority tier scheduling, SLA monitoring, live trip assignment cross-referencing, and direct link to Optimization-Based Dispatch (Google OR-Tools).

## Key components / features
- `DeliveriesView` (`frontend/src/features/fleet/DeliveriesView.tsx`):
  - Summary KPI Cards: Total Deliveries, On-Time Progress, At Risk, Deadline Missed, Handover Complete.
  - Quick Booking Desk: Collapsible `CreateCommitmentForm` for recording new consignments with Hazmat and Cold-Chain toggles.
  - Interactive Filter Tabs: All, Unassigned/Pending, In Transit, At Risk, Partial, Delivered.
  - Quick Search: Real-time search across reference codes, cargo categories, and origin/destination stations.
  - Data Table: Consignment reference linking directly to dossier (`/logistics/deliveries/[id]`), cargo weight, hazmat & cold-chain tags, priority badge, corridor, assigned trip code, SLA status badge, deadline with countdown, and dossier action.
  - CSV Export: Client-side export of filtered consignments for authorized users (`EXPORT_DATA`).
  - Optimization Solver: Tabbed integration with Google OR-Tools CVRP solver and 1-click trip dispatch flow.

## Data & API
- GET /api/v1/logistics/commitments (`useCommitments`)
- POST /api/v1/logistics/commitments (`useCreateCommitment` supporting `is_hazmat`, `requires_cold_chain`)
- GET /api/v1/logistics/trips (`useTrips`)
- GET /api/v1/logistics/vehicles (`useVehicles`)
- GET /api/v1/logistics/drivers (`useDrivers`)
- GET /api/v1/network/facilities (`useFacilities`)
- POST /api/v1/ai/optimize-dispatch (`DispatchOptimizer`)

## Behaviour notes
Consignments link to active trips without blind coupling (trip completion does not force delivery completion). Unassigned consignments display an amber alert with a direct link to the Assignment Wizard (`/logistics/assignments?consignmentId=...`).

## Tests
- `tests/integration/logistics/test_fleet_dispatch.py::TestFleetDispatchIntegration` (all 8 tests passing, including partial delivery and state transitions).
- Frontend typecheck (`npx tsc --noEmit`).

## Known issues / TODO
- None recorded.
