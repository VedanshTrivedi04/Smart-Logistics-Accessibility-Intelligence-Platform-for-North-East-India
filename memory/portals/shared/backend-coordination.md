# Shared / Backend: coordination (new 2026-09-24)

- **Last updated:** 2026-09-24

- **Source:** backend/app/modules/coordination/, migration `008_coordination_schema.py` (table `coordination_actions`)
- **Status:** done (integration tests not run: need Postgres)

- Append-only log of actions: ACKNOWLEDGE, ESCALATE, ASSIGN, REQUEST_INSPECTION, INSPECTION_COMPLETE, NOTE on subjects INCIDENT, ALERT, FACILITY, TRIP. InspectionStatus: NOT_REQUESTED/REQUESTED/COMPLETED.
- Endpoints: GET /jurisdictions (region, states, districts; public reference), POST /coordination/actions, GET /coordination/summaries (current state + history per subject).
- Needs `COORDINATE_RESPONSE` (REGIONAL, STATE, EMERGENCY).
- Tests: `backend/tests/unit/coordination`.
