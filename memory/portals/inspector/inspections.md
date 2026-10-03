# Inspector / Assigned & Active Inspections

- **Route:** /inspector/inspections
- **Source:** frontend/src/app/(protected)/inspector/inspections/page.tsx
- **Roles / capabilities:** ROAD_INSPECTION (`CONDUCT_INSPECTION`)
- **Status:** done
- **Last updated:** 2026-09-27

## Purpose
Task management hub allowing Senior Road Inspectors to filter, search, and navigate across all technical inspection missions assigned to them or their jurisdiction.

## Key components / features
- `features/inspection/InspectionsListView.tsx` - Filter tabs by status (All, Assigned, In Progress, Completed, Recheck Needed), search input filtering across instructions, edge IDs, and decisions, and task cards showing priority, road segment, and dispatch instructions.

## Data & API
- GET `/api/v1/inspections?status={tab}` - fetches filtered list of inspection entities.

## Behaviour notes
- Clean responsive layout matching field mobile operations.
- Empty states with contextual guidance when no tasks match current filters.

## Tests
- `backend/tests/integration/inspection/test_inspection_api.py`.
- Unit tests in `backend/tests/unit/inspection/test_inspection_lifecycle.py`.

## Known issues / TODO
- None.
