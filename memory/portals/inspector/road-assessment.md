# Inspector / Road Network Health & Edge Assessments

- **Route:** /inspector/road-assessment
- **Source:** frontend/src/app/(protected)/inspector/road-assessment/page.tsx
- **Roles / capabilities:** ROAD_INSPECTION (`VIEW_ROAD_STATUS`, `CONDUCT_INSPECTION`)
- **Status:** done
- **Last updated:** 2026-09-27 (fix pass)

## Purpose
Road-centric view providing an edge-by-edge status assessment across North-East national highways (NH-6, NH-27), cross-referencing each road edge with its latest completed technical inspection and official status.

## Key components / features
- `features/inspection/RoadAssessmentView.tsx` - Table and cards of road segments showing current status (OPEN, RESTRICTED, BLOCKED), corridor length, highway class, and latest inspection outcome with direct link to launch re-inspection. Fixed 2026-09-27: was reading edge fields off a nonexistent `.properties` (edge GeoJSON features carry `.props`, not `.properties`) and `feat.properties.edge_id` (should be `feat.id`) — every row previously rendered blank/undefined. Also fixed a nonsensical `zoom=100` in the `useEdges(bbox, zoom)` call and now sorts an edge's inspections by `created_at` desc before picking the "latest" one (was picking array order, not recency).

## Data & API
- GET `/api/v1/network/edges` - spatial GeoJSON road features.
- GET `/api/v1/inspections?status=ALL` - cross-linked inspection records.

## Behaviour notes
- Allows quick assessment of corridor bottlenecks and direct launch of clearance validation inspections.

## Tests
- Frontend build validation.

## Known issues / TODO
- None.
