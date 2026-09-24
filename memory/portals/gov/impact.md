# Gov / Impact of disruptions

- **Route:** /gov/impact
- **Source:** frontend/src/app/(protected)/gov/impact/page.tsx
- **Roles / capabilities:** Nav: `VIEW_IMPACT`, `VIEW_FLEET` or `VIEW_ROAD_STATUS`.
- **Status:** done
- **Last updated:** 2026-09-24

## Purpose
Which facilities, trips and consignments a disruption affects; impact chain, facility impact map, tables.

## Key components / features
- `features/impact/ImpactBoard.tsx`, `useImpactData.ts`.

## Data & API
- GET /api/v1/facilities, /facilities/{id}/impacts, /trips/{id}/impacts

## Behaviour notes
Partial-view banner if facilities were truncated; trip/consignment sections hidden without fleet visibility.

## Tests
No page-specific test.

## Known issues / TODO
- None recorded.
