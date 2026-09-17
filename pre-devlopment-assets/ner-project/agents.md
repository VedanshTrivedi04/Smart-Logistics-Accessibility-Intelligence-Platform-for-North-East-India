# Coding-agent collaboration contract

## Objective and authority

Implement the approved tasks for an evidence-aware NER essential-logistics pilot using the supplied stack. This file guides repository work; it grants no access to external systems and no authority to dispatch vehicles, publish official warnings or use production personal data.

Treat systemdesign.md as the domain/API contract, systemarchitecture.md as the component contract and tasks.md as the implementation order. Changes to any contract require a short architecture decision record, impact assessment, tests and human review. Preserve the distinction between original requirements, design recommendations, synthetic data and independently verified information.

## Shared operating rules

- Work on one acceptance-tested vertical slice at a time; inspect existing files before modifying them.
- Do not invent API availability, credentials, real facilities, government endorsements or model metrics.
- Do not silently introduce microservices, extra portals, a different database or frontend-side authorization.
- Keep domain rules in backend services/domain modules, never solely in React, routers or provider adapters.
- Treat offline edits as observations or pending commands; never mark them verified locally.
- Use generated OpenAPI client types and checked-in contract fixtures. Never maintain a second handwritten API truth.
- Distinguish infrastructure errors, no data, stale data and genuine no-path outcomes.
- Keep secrets, raw tokens, exact GPS coordinates and media URLs out of logs, fixtures and public commits.
- Add negative permission tests and migration tests for every protected resource change.
- Reject unreviewed dependency additions. Lock versions after a compatibility spike; do not select versions solely because they are newest.
- Never label fixtures live, a heuristic calibrated, a PWA continuously tracking in background, or a prototype production-ready.

## Work allocation

| Role | Owns | Required review |
|---|---|---|
| Domain lead | Status semantics, priority and verification | Road/status authority |
| Backend engineer | FastAPI, persistence, permissions, workers, OpenAPI | Security and database review |
| Frontend engineer | Next.js surfaces, field queue, map/list UX | Accessibility and offline review |
| GIS/data engineer | Graph topology, provider mapping, provenance | Route invariants and license review |
| ML engineer, later | Labels, splits, evaluation and shadow rollout | Independent evaluation sign-off |
| QA/release engineer | Scenario tests, CI gates and restore evidence | Product owner release decision |

Roles are responsibilities, not assumptions about team headcount. One person may hold several, but high-risk verification and release decisions still require separate human review.

## Definition of a complete pull request

Include task ID, change summary, impacted API/data/schema fields, migration/rollback considerations, tests actually run and outcomes, screenshots or interaction recordings where available, security/privacy implications and known limitations. Review every changed file. Do not state tests passed if they were not executed.

A schema change includes an Alembic migration with upgrade evidence. A route change includes blocked-edge and no-path tests. An offline change includes duplicate retry, expired session and interrupted-media tests. A permission change includes list, detail, export, media and streaming access tests.

## Stop-and-escalate conditions

Stop when a requested operation would reopen a road without authority, publish an unverified report as official truth, bypass organization/geographic scope, erase audit records, acquire unlicensed maps, use undisclosed location tracking, or substitute a model output for a dispatch decision. Explain the blocking decision in the pull request and continue only on safe independent tasks.

## Completion reporting

Report implemented behavior, commands actually executed, failed/skipped checks and remaining prerequisites. Link to changed contracts and tests. Do not claim deployment, data integration, model training or provider verification merely because adapter interfaces exist.
