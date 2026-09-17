# Cross-functional capabilities and review gates

## Meaning

This is a project-specific quality and execution guide. It is not a dependency, plugin, model capability declaration or automatic grant of permissions. The filename preserves the user's request.

## Capability 1: Work backward from an operational decision

For every feature name who decides, what evidence they see, what action is permitted and how success is measured. A map layer without a decision or validation purpose is lower priority than reliable reporting and impact analysis.

## Capability 2: Preserve epistemic boundaries

Carry three different states throughout the stack: what was observed, what an authority confirmed, and what an analytical model estimated. Add age and spatial coverage. Never compress these into one green/yellow/red value or one unexplained score.

## Capability 3: Design the failure path first

Specify behavior when the road graph has a gap, the weather feed is stale, GPS stops, the browser closes, two reviewers race, a media upload fails or an alert provider times out. A route result must remain intelligible without a basemap. A field report must remain recoverable without connectivity.

## Capability 4: Build reversible slices

Use feature flags for new adapters/models. Use immutable route-plan revisions and explicit status-decision history. Roll back a model or UI release without rolling back verified field evidence. Reprocess outbox events safely and isolate scenarios from live tables.

## Capability 5: Prove the closed loop

The release demonstration must show offline capture, deduplicated sync, authorized review, confirmed closure, impacted trip identification, an admissible alternative or no-path result, personalized alert and acknowledged human action. Include a reopening with separate authority and an immutable audit trail.

## Capability 6: Challenge the recommendation

Ask why a route is permissible, which observations are stale, whether a bridge limit is missing, whether weather resolution supports the conclusion and whether the vehicle can actually traverse the route. Unknown hard constraints cannot silently become unrestricted access for critical dispatch.

## Review gates

| Gate | Evidence required | Release blocker |
|---|---|---|
| Scope | Approved corridor, scenarios, accountable operators | No named operational owner |
| Data | Provenance, permissions, samples, coverage | Unlicensed or undocumented operational data |
| Safety | Hard-closure/no-path/unknown tests | Any forbidden edge in a recommended route |
| Isolation | Backend/RLS/media/stream negative tests | Cross-organization or cross-scope disclosure |
| Offline | Retry, conflict, storage and auth-expiry browser tests | Lost or duplicated durable report |
| Reliability | Lag metrics, restore evidence and escalation runbook | No tested recovery path |
| ML, later | Holdout report and shadow evaluation | Uncalibrated claims or unverifiable accuracy |
| Pilot | Operator validation and limitations statement | Unreviewed operational deployment |

## Scope controls

Do not implement public crowdsourcing, automated emergency dispatch, blockchain provenance, face recognition, unrestricted vehicle tracking or a general AI assistant as shortcuts to differentiation. The core differentiator is trustworthy supply continuity under uncertainty, not the number of technologies used.
