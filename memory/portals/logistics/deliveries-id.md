# Logistics / Delivery Consignment Dossier

- **Route:** /logistics/deliveries/[id]
- **Source:** frontend/src/app/(protected)/logistics/deliveries/[id]/page.tsx
- **Roles / capabilities:** VIEW_FLEET (view), DISPATCH_ROUTE / SUBMIT_GPS (status update & POD)
- **Status:** done
- **Last updated:** 2026-09-28

## Purpose
Comprehensive operational dossier for an individual consignment commitment: cargo specifications, lifecycle milestones timeline, linked vehicle & driver allocation, disruption impact warnings, cancellation/reassignment audit history, and authoritative destination proof of delivery (POD) status updates.

## Key components / features
- `features/fleet/DeliveryDetail.tsx`:
  - Consignment Header: Consignment reference (e.g. `DL-402`), dual delivery & SLA status badges, priority tier badge, cargo classification, hazmat/cold-chain indicators.
  - Cancellation / Reassignment Audit Banner: Prominently displays previous trip code, trip status, cancellation reason (e.g. road obstruction), and release timestamp when a cancelled trip returns consignments to pending pool.
  - Cargo Specs: Consigned weight, cargo volume ($m^3$), quantity units delivered vs consigned, shortage alerts, recipient name, organization, condition, and origin/destination stations.
  - Operational Allocation: Linked trip code, vehicle registration, and driver name with direct cross-navigation links; unassigned CTA if not yet dispatched.
  - Handover Milestones Timeline: 5-step lifecycle tracking (Created $\to$ Fleet Assigned $\to$ Dispatched $\to$ In-Transit $\to$ Destination Handover).
  - Active Disruption Impact Warning: Displays assessed road hazard delays, severity, and reroute directives if the linked trip's route is disrupted.
  - Proof of Delivery (POD) Drawer: Authoritative handover recording supporting Full Delivery, Partial Delivery (with calculated shortage units & mandatory shortage reason), or Delivery Failed. Captures recipient name, recipient organization, cargo condition (Good, Damaged Packaging, Partial Loss, Temperature Excursion, Rejected), and recipient signature/acknowledgement token.

## Data & API
- GET /api/v1/logistics/commitments/{id} (`useCommitment`)
- PATCH /api/v1/logistics/commitments/{id}/status (`useUpdateCommitmentStatus` supporting `delivered_units`, `shortage_reason`, `recipient_name`, `recipient_organization`, `pod_signature_acknowledgement`, `delivery_condition`)
- GET /api/v1/logistics/trips (`useTrips`)
- GET /api/v1/logistics/vehicles (`useVehicles`)
- GET /api/v1/logistics/drivers (`useDrivers`)
- GET /api/v1/trips/{trip_id}/impacts (`useTripImpacts`)
- GET /api/v1/network/facilities (`useFacilities`)

## Behaviour notes
Trip completion does NOT automatically mark deliveries as DELIVERED; individual POD submission is the authoritative completion event. If a trip is aborted or cancelled, commitments are released back to PENDING while preserving historical trip code, previous status, reason, and release timestamp. Strict state transitions are enforced (`validate_delivery_state_transition`).

## Tests
- `tests/integration/logistics/test_fleet_dispatch.py::TestFleetDispatchIntegration` (all 8 tests passing, including partial delivery and state transitions).
- Frontend typecheck (`npx tsc --noEmit`).

## Known issues / TODO
- Photo upload for POD is planned for mobile driver terminal phase.
