# Shared / Feature: network (roads and facilities)

- **Last updated:** 2026-09-24

- **Source:** frontend/src/features/network/*
- **Used by:** [[gov/map]], [[gov/home]], [[gov/regions]], [[field/road-update]], [[gov/emergency]]
- **Status:** done, with type errors in AccessibilityExplorer

- `AccessibilityExplorer` (1148 lines, rewritten outside tracked sessions), `panels.tsx` (EdgePanel with declare-status form, FacilityPanel with reachability/bottlenecks/impacts), `edges.ts` (`parseEdgeCollection`, `summarizeEdges`, `EDGE_LIMIT`, edge now carries `jurisdiction_id`), `FacilitySelect`, `queries.ts`.
- Edge statuses: OPEN, RESTRICTED, BLOCKED, PROVISIONAL_CAUTION, UNKNOWN.
- Backend: [[shared/backend-network]].
