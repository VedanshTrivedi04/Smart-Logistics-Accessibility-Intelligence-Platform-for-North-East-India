# Shared / Feature: fleet

- **Last updated:** 2026-09-24

- **Source:** frontend/src/features/fleet/*
- **Used by:** [[gov/fleet]], [[gov/fleet-trips]], [[gov/fleet-trips-id]], [[gov/fleet-vehicles-id]], [[gov/fleet-deliveries]], all `logistics/*` pages, [[gov/home]]
- **Status:** done

- `FleetMap`, `VehiclePanel`, `TripList`, `TripDetail`, `CommitmentList/Table`, `DeliveryHistory`, `VehicleDetail`, `OperatorCockpit`, forms (`FleetManagement`, `DriverList`), `gps.ts`, `queries.ts` (useVehicles, useTrips, useCommitments, useFleetPositions).
- Base paths are props (`vehicleBase`, `tripBase`, `routeBase`) so the same component serves /gov and /logistics.
- GPS staleness statuses: fresh, STALE_WARNING, FEED_OFFLINE.
- Backend: [[shared/backend-logistics]], [[shared/backend-telemetry]].
