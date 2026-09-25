# Gov / Regional map

- **Route:** /gov/map
- **Source:** frontend/src/app/(protected)/gov/map/page.tsx
- **Roles / capabilities:** Guard `VIEW_ROAD_STATUS`.
- **Status:** done (has type errors, see issues)
- **Last updated:** 2026-09-25

## Purpose
Regional situational map: road status, facilities, risk zones, with vehicles, active incidents and field reports as layers.

## Key components / features
- `features/overview/CommandMap.tsx` -> `features/network/AccessibilityExplorer.tsx`, `panels.tsx` (EdgePanel/FacilityPanel), `shared/map/MapView.tsx`.
- `useScopeFilter` for State Authority auto-zoom and bounding box containment.

## Data & API
- edges (bbox on pan/zoom), facilities, risk-zones, incidents, fleet positions.

## Behaviour notes
Loads data for the visible area. Facility kinds have glyphs (hospital, relief warehouse, oxygen plant, fuel depot, ...).
- **State Authority:** When logged in as a State Authority (e.g. Bhaskar Singh), displays an authoritative state jurisdiction banner, automatically centers and fits bounds to the assigned state (`stateBBox`, e.g. Assam `[89.7, 24.1, 96.0, 28.2]`), filters mapped vehicles, incidents, and road edges to state borders, and provides a toggle to expand to the full 8-state Northeast region.
- **District Officer:** When logged in as District Verifier (e.g. Chitralekha Devi), displays an emerald jurisdiction banner, automatically fits map bounds to Kamrup Metropolitan (`districtBBox` `[91.50, 25.95, 91.98, 26.35]`), filters facilities, road edges, incidents, and vehicles through `isWithinScope`, focusing specifically on Guwahati urban corridors, Saraighat bridge, and Sonapur border defiles.

## Tests
No page-specific test.

## Known issues / TODO
- Fixed `ReferenceError: isWithinAssignedState is not defined` (2026-09-25): replaced obsolete `isWithinAssignedState` with unified `isWithinScope` backed by `isWithinAssignedScope`.
- `AccessibilityExplorer.tsx` has some legacy type casting in points/lines due to API evolutions.
