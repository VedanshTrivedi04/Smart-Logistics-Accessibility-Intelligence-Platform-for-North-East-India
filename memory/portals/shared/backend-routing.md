# Shared / Backend: routing

- **Last updated:** 2026-09-24

- **Source:** backend/app/modules/routing/, migration 006
- **Status:** done

- POST /routes/evaluate, GET /routes/{route_plan_id}, POST /trips/{trip_id}/dispatch-decisions. Plans are snapshots that expire. Public variant: POST /public/routes/evaluate.
- Tests: `backend/tests/unit/routing`.
