# Gov / Regional map

- **Route:** /gov/map
- **Source:** frontend/src/app/(protected)/gov/map/page.tsx
- **Roles / capabilities:** Guard `VIEW_ROAD_STATUS`.
- **Status:** done (has type errors, see issues)
- **Last updated:** 2026-09-24

## Purpose
Regional situational map: road status, facilities, risk zones, with vehicles, active incidents and field reports as layers.

## Key components / features
- `features/overview/CommandMap.tsx` -> `features/network/AccessibilityExplorer.tsx` (1148 lines), `panels.tsx` (EdgePanel/FacilityPanel), `shared/map/MapView.tsx`.

## Data & API
- edges (bbox on pan/zoom), facilities, risk-zones, incidents, fleet positions.

## Behaviour notes
Loads data for the visible area. Facility kinds have glyphs (hospital, relief warehouse, oxygen plant, fuel depot, ...).

## Tests
No page-specific test.

## Known issues / TODO
- `AccessibilityExplorer.tsx` was rewritten outside tracked sessions and has ~25 type errors (Incident lat/lon, vehicle plate_number/speed_kmh not in API). Left untouched at the user's request.
