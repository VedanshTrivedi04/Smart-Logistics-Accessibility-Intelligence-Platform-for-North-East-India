# Shared / Feature: incidents and reports

- **Last updated:** 2026-09-24

- **Source:** frontend/src/features/incidents/*
- **Used by:** [[gov/incidents]], [[gov/incidents-id]], [[gov/reports]], [[gov/reports-id]], [[gov/home]], [[gov/analytics]]
- **Status:** done

- `IncidentCommandCenter` (new triage UI, 1284 lines), `IncidentDetail`, `IncidentImpact` (new: affected trips/deliveries/facilities + regional impact level), `ReportReview`, `lists.tsx` (IncidentList, ReportQueue), `evidence.tsx` (media via presigned GET), `queries.ts` (LIST_LIMIT truncation constant).
- Backend: [[shared/backend-reporting-incidents]].
