# Public / Route & Corridor Checker

- **Route:** /public
- **Source:** frontend/src/app/public/page.tsx
- **Roles / capabilities:** Anyone (no login).
- **Status:** done
- **Last updated:** 2026-09-24

## Purpose
Citizen-facing passability check across NER corridors: pick origin/destination, see route, elevation profile, directions and advisories, without an account.

## Key components / features
- `features/routing/PublicRouteCheck.tsx` (672 lines): city presets (Guwahati, Shillong, Silchar, Tezpur, Jorhat, Dibrugarh, Aizawl, Kohima, Imphal, Agartala), AddressSearch, DirectionsList, ElevationProfile.
- `features/routing/publicQueries.ts`.

## Data & API
- POST /api/v1/public/routes/evaluate (standard private vehicle; backed by `_build_curved_corridor_route` when OSRM is unreachable so lines follow physical highway pavements and cross Brahmaputra strictly via Saraighat or Kolia Bhomora bridges)
- GET /api/v1/public/network/edges, /public/incidents (redacted), /public/hazard/risk-zones

## Behaviour notes
Public endpoints are redacted (incidents show type/severity/approximate area only). Result states: no feasible path; insufficient data (road condition unknown, verification required). Clicking a direction step focuses the map. Map overlay filters out OPEN edges so underlying satellite basemap roads show clearly without synthetic straight line chords.

## Tests
No page-specific test.

## Known issues / TODO
- None recorded.
