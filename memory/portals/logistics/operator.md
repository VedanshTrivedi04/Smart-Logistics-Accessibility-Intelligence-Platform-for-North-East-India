# Logistics / Driver & Operator Cockpit

- **Route:** /logistics/operator
- **Source:** frontend/src/app/(protected)/logistics/operator/page.tsx
- **Roles / capabilities:** TRANSPORT_OPERATOR (scoped: can view assigned trip and submit telemetry/POD for its consignments), FLEET_MANAGER, DELIVERY_COORDINATOR.
- **Status:** done
- **Last updated:** 2026-09-28

## Purpose
Driver view: assigned vehicle and active mission, GPS fix, corridor hazards, one-touch actions (start, pause/checkpoint, emergency broadcast), individual consignment handover POD drawer, and trip completion.

## Key components / features
- `features/fleet/OperatorView.tsx`:
  - Mission Card: Active trip status, planned vs actual arrival, vehicle details, driver details, corridor stops.
  - Consignment List & Interactive Handover Drawer: Each consignment on board has a dedicated "Handover / POD" button opening an interactive drawer for recording delivered units, shortage reasons, recipient name, organization, cargo condition, and GPS tagging.
  - One-Touch GPS Tagging: Drivers can tag exact current coordinates directly into the POD form.
  - Trip Completion Guard: Warns driver if attempting to complete the trip while consignments still remain in-transit without explicit POD.
  - Emergency Broadcast: One-touch SOS to fleet operations command.

## Data & API
- POST /api/v1/logistics/trips/{id}/transition
- PATCH /api/v1/logistics/commitments/{id}/status (scoped: driver can only update consignments on their own active trip)
- POST /telemetry/ingest (GPS telemetry)

## Behaviour notes
Trip completion is decoupled from consignment delivery. Handover / POD is performed per delivery consignment. Driver RBAC is strictly scoped so drivers cannot tamper with arbitrary commitments outside their active mission.

## Tests
- `tests/integration/logistics/test_fleet_dispatch.py::TestFleetDispatchIntegration`
- Frontend typecheck (`npx tsc --noEmit`).

## Known issues / TODO
- Offline synchronization of photo attachments when passing through cellular dead zones in mountain passes.
