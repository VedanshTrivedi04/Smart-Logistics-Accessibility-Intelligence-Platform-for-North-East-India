# Inspector / Command Dashboard

- **Route:** /inspector
- **Source:** frontend/src/app/(protected)/inspector/page.tsx
- **Roles / capabilities:** ROAD_INSPECTION (`CONDUCT_INSPECTION`, `VIEW_ROAD_STATUS`, `VERIFY_REPORT`)
- **Status:** done
- **Last updated:** 2026-09-27

## Purpose
Field command dashboard for the Senior Road Inspector. Provides quick situational awareness across assigned technical inspection missions, priority breakdowns (CRITICAL/HIGH), an active mission card with one-click access, and sensor telemetry (GPS accuracy/elevation fix).

## Key components / features
- `features/inspection/InspectorHomeView.tsx` - Metric KPI strip (Assigned, In Progress, Completed, Recheck Needed), active mission focus card with live GPS fix and target distance, quick navigation actions to tasks, reports, and corridor road health.

## Data & API
- GET `/api/v1/inspections/stats` - aggregate KPI counts grouped by inspection lifecycle state.
- GET `/api/v1/inspections?status=ASSIGNED` - assigned inspection tasks awaiting claim.
- GET `/api/v1/inspections?status=IN_PROGRESS` - active in-progress inspection missions.

## Behaviour notes
- Graceful offline fallback via IndexedDB snapshot cache and geolocation hook.
- Immediate visual indicators for high-risk landslide/bridge damage tasks requiring urgent deployment.

## Tests
- Backend API tests in `backend/tests/integration/inspection/test_inspection_api.py`.
- Frontend build validation.

## Known issues / TODO
- None.
