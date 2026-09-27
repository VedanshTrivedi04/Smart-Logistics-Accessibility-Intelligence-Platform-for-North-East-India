# Shared / Backend: impact

- **Last updated:** 2026-09-27

- **Source:** backend/app/modules/impact/, migration 006
- **Status:** done

- POST /impact/evaluate; GET /facilities/{id}/impacts, GET /trips/{id}/impacts.
- GET /edges/{edge_id}/impacts added (gated by `require_capability(Capability.VIEW_IMPACT)`), returns `list[TripImpactResponse]` for active trips traversing the edge, scoped by organization with regional bypass.
- Repository: `list_trip_impacts_by_edge` implemented in `SqlAlchemyImpactRepository` joining `trips` on `TripImpactModel.trip_id`.
- Tests: `backend/tests/unit/impact`, `backend/tests/integration/impact/test_edge_impacts.py`.
