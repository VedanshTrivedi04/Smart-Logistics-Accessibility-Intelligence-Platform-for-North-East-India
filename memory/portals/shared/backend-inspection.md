# Shared / Backend: Inspection Module

- **Module:** `backend/app/modules/inspection`
- **Tables:** `inspections`, `inspection_media`
- **Migration:** `012_inspections_schema.py`
- **Status:** done
- **Last updated:** 2026-09-27

## Purpose
Hexagonal architecture module managing the technical inspection lifecycle: dispatching inspectors to critical/provisional caution incidents, tracking on-site engineering assessments (damage type, slope movement, debris depth, bridge pier scour depth, passability), linking categorized evidence photos, and executing authoritative decisions that directly update edge status and emit outbox events.

## Domain Model
- `Inspection`: id, report_id, incident_id, candidate_edge_id, assigned_to_user_id, assigned_by_user_id, jurisdiction_id, priority (`CRITICAL`, `HIGH`, `NORMAL`, `LOW`), status (`ASSIGNED`, `IN_PROGRESS`, `COMPLETED`, `REINSPECTION_REQUIRED`, `CANCELLED`), instructions, assessment (JSONB), final_decision, decision_notes, started_at, completed_at.
- `TechnicalAssessment`: road_condition, passability (`IMPASSABLE`, `SINGLE_LANE_ONLY`, `LIGHT_VEHICLES_ONLY`, `NORMAL_TWO_WAY`), damage_type (`LANDSLIDE`, `MUDFLOW`, `ROCKFALL`, `FLOODING`, `BRIDGE_SCOUR`, `PAVEMENT_COLLAPSE`, `EROSION`, `OTHER`), stability (`STABLE`, `ACTIVE_MOVEMENT`, `MONITORING_REQUIRED`), affected_length_m, affected_width_m, debris_depth_m, bridge_pier_scour_depth_m, water_level_over_road_cm, slope_movement_detected, heavy_vehicle_passable, recommended_speed_limit_kmh, technical_notes.
- `InspectionEvidence`: media_id, kind (`WIDE_ANGLE`, `CLOSEUP`, `BRIDGE_PIER`, `ROAD_SURFACE`, `SLOPE_FAILURE`, `WATER_LEVEL`, `GPS_ACCURACY`), caption, latitude, longitude, altitude_m, azimuth_deg.

## Use Cases
- `AssignInspectionUseCase` - assigns inspection mission with jurisdiction & capability validation.
- `ListInspectionsUseCase` - retrieves inspections filtered by status/jurisdiction.
- `GetInspectionDetailUseCase` - retrieves full inspection dossier with evidence; scoped by `_can_view` (see below).
- `GetLatestEdgeInspectionUseCase` (added 2026-09-27) - latest inspection for a given `candidate_edge_id`, same `_can_view` scoping, returns `None` (not an error) when unauthorized since it feeds a status display, not a detail page.
- `StartInspectionUseCase` - sets status to `IN_PROGRESS` and transitions linked report to `UNDER_REVIEW`.
- `SubmitInspectionAssessmentUseCase` - persists technical assessment JSONB and tags evidence media. Takes an optional `reporting_repo`; when set, every evidence `media_id` is validated against `media_objects` (must exist, `uploader_id == principal.user_id`, `scan_status == CLEAN`) before insert, raising `InspectionValidationError` (-> HTTP 400) instead of letting a bad id reach the DB as a raw FK violation.
- `DecideInspectionUseCase` - applies authoritative decision, updates road edge status via `DeclareEdgeStatusUseCase`, calls `VerifyReportUseCase`, and dispatches outbox event. Decisions: `VERIFIED`, `REJECTED`, `REINSPECTION_REQUIRED`, and `MORE_INFO_NEEDED`/`REQUEST_MORE_INFO` (routes to `VerifyReportUseCase` with `ReviewDecisionKind.REQUEST_MORE_INFO` and marks the inspection re-inspection-required — there is no dedicated status for this, it reuses `REINSPECTION_REQUIRED`).
- `GetInspectionStatsUseCase` - returns KPI summary counts.
- `list_available_inspectors()` (repository method, added 2026-09-27) - users holding `ROAD_INSPECTION` with an active membership, for the assignment picker. Exposed via `GET /api/v1/inspections/inspectors` -> `InspectorSummaryResponse[]`.

## Security & RBAC (fixed 2026-09-27 — see below, was broken)

- Role: `ROAD_INSPECTION` (capabilities: `CONDUCT_INSPECTION`, `VERIFY_REPORT`, `UPDATE_ROAD_STATUS`, `VIEW_ROAD_STATUS`).
- Router: all 8 endpoints now gated by module-level `_INSPECTION_ACCESS = require_any_capability(CONDUCT_INSPECTION, ASSIGN_INSPECTION, COORDINATE_RESPONSE)`. Previously every endpoint used bare `require_authenticated` — any signed-in user of any role could call any inspection endpoint.
- Assignment scoping: `_can_view(inspection, principal)` = `inspection.assigned_to == principal.user_id or _is_supervisor(principal)`, `_is_supervisor` = holds `ASSIGN_INSPECTION` or `COORDINATE_RESPONSE`. Used by `DecideInspectionUseCase`, `GetInspectionDetailUseCase`, `GetLatestEdgeInspectionUseCase`.
  - **Prior bug**: `DecideInspectionUseCase` checked `principal.can(VERIFY_REPORT)` as the "am I allowed to act on someone else's inspection" bypass — but `VERIFY_REPORT` is a *baseline* capability every `ROAD_INSPECTION` holder has (see role_capabilities.py), so the check was always true and any inspector could decide any other inspector's assigned mission. Fixed by switching the bypass to `_is_supervisor` (a real supervisory capability), covered by `TestAssignmentScoping` in `test_inspection_lifecycle.py`.
- Gov authorities with `ASSIGN_INSPECTION` can dispatch inspectors.

## Outbox notification (shared pattern, fixed 2026-09-27)

`DeclareEdgeStatusUseCase` (`network/application/declare_edge_status.py`) takes an optional `on_status_changed: Callable[[EdgeStatusChangeNotification], Awaitable[None]]` invoked after a successful status change. `network/api/router.py` exposes `make_edge_status_outbox_notifier(incident_repo)` building this callback (writes `edge_status.updated` to `outbox_events`). Both the network router's own `declare_edge_status` endpoint and `DecideInspectionUseCase` (via the inspection router) construct `DeclareEdgeStatusUseCase` with this same notifier — previously only the network router endpoint emitted the outbox event, so decisions made through `/inspections/{id}/decide` silently never triggered impact recalculation. See [[backend-network]].

## Known issues / TODO

- Integration test `test_inspection_api.py::test_create_and_list_inspections` exercises `/decide` against a real seeded road edge (`06a8d7b4-a64d-5756-97f7-0c870722b5bf`) since there is no per-test DB transaction rollback (shared Neon dev DB). Its cleanup block explicitly resets that edge back to `OPEN`/`FRESH` afterward — do not remove that reset, or later runs of `tests/integration/network/test_topology_pgrouting.py` in the same suite will fail as "no path found" through a road segment the test suite assumes is open.
