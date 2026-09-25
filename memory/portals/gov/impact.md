# Gov / Disruption Impact & Route Intelligence Command Center

- **Route:** /gov/impact
- **Source:** frontend/src/app/(protected)/gov/impact/page.tsx
- **Roles / capabilities:** Nav: `VIEW_IMPACT`, `VIEW_FLEET` or `VIEW_ROAD_STATUS`. Advisory directive: `DISPATCH_DECISION` / Regional Commander advisory authority.
- **Status:** done
- **Last updated:** 2026-09-25

## Purpose
Unified command surface combining operational disruption cascades, affected fleet trips, critical consignment SLA risk, facility accessibility, and an embedded Route Intelligence Studio with dual-route comparison maps and Regional Commander dispatch directives.

## Key components / features
- `features/impact/ImpactCommandCenter.tsx` – Master unified tactical operations center.
- `features/impact/ImpactBoard.tsx` – Legacy board component maintained for modular consumption.
- `features/impact/useImpactData.ts` – Backend hook aggregating facility and trip impacts.
- `useScopeFilter` for State Authority role adaptation and corridor isolation.
- **Top 4 Tabs:**
  - `Overview`: Active disruption counters (Critical, High, Moderate, Cleared), cascading 5-stage interactive impact chain (`ROAD DISRUPTION` → `Affected Trips` → `Affected Deliveries` → `SLA Risk` → `Facility Accessibility`), interactive SVG Speedometer gauge (Facility Accessibility, Corridor Network Capacity), SVG SLA Risk donut chart, corridor delay distribution bars (NH-6, NH-29, NH-2, NH-10, NH-306), and MapLibre GL tactical map.
  - `Trips`: Disrupted convoys with interactive 3-step pipeline (`TR-208` → `View Impact` → `Route Intelligence`). Vehicle `AS01XX1234`, distance to blockage `12.4 km ahead`, `BLOCKED_ROUTE`, `REROUTE MANDATORY`. Includes expandable impact dossier and one-click launch into Route Intelligence Studio.
  - `Deliveries`: High-consequence cargo risk (e.g. `DL-402` Insulin / Critical Medical, `TIER-1 CRITICAL`, original ETA 16:30, projected 19:10, SLA `🔴 BREACHED`, cold-chain indicator), live backend query via `useCommitments`.
  - `Facilities`: Isolated hospitals and distribution nodes (e.g. `Civil Hospital Shillong`, `🔴 NO FEASIBLE PATH / ISOLATED`, 3 critical medical shipments blocked, +3h 15m delay), live backend query via `useFacilities`.
- **Embedded Route Intelligence Studio (Inline within `/gov/impact`):**
  - Seamlessly embedded directly inside the impact center (`#route-intelligence-studio`); no separate page navigation.
  - Multi-route comparative analysis:
    - `ORIGINAL ROUTE 🔴 BLOCKED` (NH-6 via Sonapur Pass, indefinite delay >8h, convoy halted at KM 12.4).
    - `ALTERNATIVE A 🟢 FEASIBLE +32 min` (Eastern Ridge Nongpoh Bypass, 112.0 km, 45-point high-density GPS curve following NH-6 4-lane expressway through Byrnihat, Nongpoh, Umsning, Barapani, Mawlai, and Shillong).
    - `ALTERNATIVE B 🟡 FEASIBLE +67 min` (Umtrew Valley Defile Detour, 136.0 km, 30-point curve hugging the Umtrew river gorge road before rejoining at Umsning).
  - Dual-route tactical map: Simultaneously draws all 3 routes (Original Blocked in red, Alternative A in green `#16a34a`, Alternative B in amber `#eab308`) with high-resolution GPS road adherence, directional chevrons, and tactical vehicle/blockage markers.
  - Human-in-the-loop governance: System computes recommendations but *never* diverts vehicles automatically (`System automatically vehicle divert nahi karega`). Regional Commander reviews options and transmits official advisory directives (`POST /api/v1/trips/{id}/dispatch-decisions`) to the carrier desk.

## Data & API
- GET `/api/v1/facilities` (query key `["facilities"]`)
- GET `/api/v1/facilities/{id}/impacts` (query key `["facility-impact", id]`)
- GET `/api/v1/trips` (query key `["trips"]`)
- GET `/api/v1/trips/{id}/impacts` (query key `["trip-impact", id]`)
- GET `/api/v1/commitments` (query key `["commitments"]`)
- GET `/api/v1/incidents` (query key `["incidents"]`)
- POST `/api/v1/routes/evaluate`
- POST `/api/v1/trips/{id}/dispatch-decisions`

## Behaviour notes
- Synchronized 3-step workflow: Selecting `TR-208` ➔ expanding `View Impact` ➔ launching `Route Intelligence` anchors smoothly to the embedded studio.
- Embedded studio: Opens inline without navigating away from the operational surface, preserving situational context.
- Fallback & resilience: Full graceful handling of partial network responses and zero-mock dynamic rendering.
- **State Authority:** For State Authority users (e.g. Bhaskar Singh), displays an authoritative state supply chain impact banner, scopes disrupted trips, affected deliveries, and isolated facilities to the state's corridors (e.g. NH-27 Nagaon, Guwahati, Silchar), fits the tactical overview map to state bounds, and provides a toggle to review regional cross-border impacts.
- **District Officer:** For District Verifiers (e.g. Chitralekha Devi), displays an emerald impact desk banner, bounds tactical overview map to Kamrup Metropolitan (`districtBBox`), and scopes convoy disruption analysis to trips traversing district arteries (Guwahati urban logistics, Saraighat bridge, and Sonapur border corridor).

## Tests
- Tested via Next.js compilation, TypeScript checking, and component test suite.

## Known issues / TODO
- None recorded.

