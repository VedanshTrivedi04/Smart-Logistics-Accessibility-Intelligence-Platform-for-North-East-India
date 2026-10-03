# Shared / Backend: routing

- **Last updated:** 2026-09-27

- **Source:** backend/app/modules/routing/, migration 006
- **Status:** done

- POST /routes/evaluate, GET /routes/{route_plan_id}, POST /trips/{trip_id}/dispatch-decisions. Plans are snapshots that expire. Public variant: POST /public/routes/evaluate.
- `snap_coordinates_to_node` updated with a robust 100km (`100000.0m`) default snapping radius across both port and repository, ensuring points in remote North-East regions snap reliably.
- `build_linestring` in `EvaluateRouteUseCase` stitches curving road edge geometries and attaches origin and destination coordinates seamlessly, eliminating straight line vectors.
- Tests: `backend/tests/unit/routing`, `backend/tests/integration/routing/test_route_lifecycle_and_dispatch.py`, `backend/tests/integration/routing/test_pgrouting_constraints.py`.
