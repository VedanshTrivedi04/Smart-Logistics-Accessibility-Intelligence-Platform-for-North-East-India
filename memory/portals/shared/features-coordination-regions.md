# Shared / Feature: coordination and regions (added 2026-09-24)

- **Last updated:** 2026-09-24

- **Source:** frontend/src/features/coordination/*, frontend/src/features/regions/*
- **Used by:** [[gov/regions]], [[gov/incidents]], [[gov/incidents-id]], [[gov/alerts]]
- **Status:** done

- Coordination: `CoordinationPanel` (incident), `AlertCoordination` (acknowledge/escalate alerts), `queries.ts` (jurisdiction index, summaries, record action).
- Regions: `RegionalBreakdown`, `breakdown.ts` (state-wise aggregation using jurisdiction ids).
- Coordination log is append-only; current state per subject is derived from history. Backend: [[shared/backend-coordination]].
- Test: `tests/unit/regions-coordination.test.ts`.
