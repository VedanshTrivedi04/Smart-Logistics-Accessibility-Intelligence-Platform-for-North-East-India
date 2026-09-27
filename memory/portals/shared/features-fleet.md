# Shared / Feature: fleet

- **Last updated:** 2026-09-28

- **Source:** frontend/src/features/fleet/*
- **Used by:** [[gov/fleet]], [[gov/fleet-trips]], [[gov/fleet-trips-id]], [[gov/fleet-vehicles-id]], [[gov/fleet-deliveries]], all `logistics/*` pages, [[gov/home]]
- **Status:** done

- `DeliveriesView`, `DeliveryDetail`, `AssignmentsView`, `DispatchOptimizer`, `OperatorView`, `FleetMap`, `VehiclePanel`, `TripList`, `TripDetail`, `CommitmentList/Table`, `DeliveryHistory`, `VehicleDetail`, `forms.tsx`, `gps.ts`, `queries.ts`.
- Authoritative POD drawer with multi-condition support, partial shortages, recipient verification, and GPS capture.
- Cancellation and reassignment audit history visualization.
- Google OR-Tools optimization-based dispatch solver integration.
- Base paths are props (`vehicleBase`, `tripBase`, `routeBase`) so the same component serves /gov and /logistics.
- GPS staleness statuses: fresh, STALE_WARNING, FEED_OFFLINE.
- Backend: [[shared/backend-logistics]], [[shared/backend-telemetry]].
