# Gov / Fleet Monitoring & Delivery Operations

- **Route:** /gov/fleet
- **Source:** frontend/src/app/(protected)/gov/fleet/page.tsx
- **Roles / capabilities:** Guard `VIEW_FLEET`. Baseline roles holding it: REGIONAL_AUTHORITY, EMERGENCY_COORDINATOR, FLEET_MANAGER, DELIVERY_COORDINATOR.
- **Status:** done
- **Last updated:** 2026-09-25

## Purpose
Unified command center answering "Which vehicles are delivering what, and what is their current operational condition?". Combines live fleet geospatial monitoring with critical delivery operations across Northeast India.

## Key components / features
- `FleetOperationsCenter` (`features/fleet/FleetOperationsCenter.tsx`):
  - Top 5 KPI metric cards: Active Vehicles, In Transit, Delayed, At Risk / Disrupted, Offline / Stale.
  - Interactive Live GIS Map with status-coded vehicle pins (🔴 Disrupted, 🟡 Delayed, 🟢 On Time, ⚪ Offline) and active road-following route polylines.
  - Operations table with search, status filters, vehicle reg, trip codes, states, operational statuses, ETAs, and cargo manifests.
  - 7-Layer Vehicle Inspection Dossier: Vehicle Profile ➔ Live GPS ➔ Current Trip ➔ Cargo Manifest ➔ Route Stops Timeline ➔ ETA ➔ Impact Alert & Route Intelligence CTA.
  - Critical Deliveries Section: Medical Supplies, Food & Water, Construction & Logistics, Emergency Equipment with SLA health tracking.
  - `useScopeFilter` for State Authority fleet desk and intra-state freight corridors.

## Data & API
- GET /api/v1/logistics/vehicles, /telemetry/vehicles/{id}/position, /api/v1/logistics/trips, /api/v1/logistics/commitments, /api/v1/logistics/drivers, /api/v1/network/facilities

## Behaviour notes
Selectable vehicle rows synchronize map focus and route polyline with detailed 7-layer inspection dossier. Disrupted trips provide direct action to `/gov/impact`.
- **State Authority:** When viewed by a State Authority (e.g. Bhaskar Singh), displays an authoritative state fleet operations banner, scopes active vehicles (34 active, 26 in transit, 5 delayed, 4 at risk, 1 offline) and deliveries to the state's corridors (NH-27, NH-6, NH-15, Guwahati, Nagaon, Silchar), centers map bounds to the state, and allows toggling to inspect full regional fleet operations.
- **District Officer:** When viewed by a District Verifier (e.g. Chitralekha Devi), displays an emerald district fleet desk banner, centers map bounds to Kamrup Metropolitan (`districtBBox`), and scopes tracking specifically to commercial fleets traversing the district (e.g. `AS-01` registration codes, Guwahati city rings, Saraighat bridge crossings, and Sonapur border checkpoints).

## Tests
No page-specific test.

## Known issues / TODO
- None recorded.
