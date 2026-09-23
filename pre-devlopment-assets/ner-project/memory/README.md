# PARVA Feature Memory — Index

Purpose: Feature-by-feature working memory for the PARVA / NER logistics platform. Each file in this
folder documents ONE feature from `PARVA_Complete_Feature_Functionality_and_Working_Specification.md`
(and/or `NER_Smart_Logistics_Portal_Wise_Functionality_Specification.md`) analyzed against the existing
contracts: `systemdesign.md`, `systemarchitecture.md`, `tasks.md`, and the rules in `AGENTS.md`.

This is project documentation, not implementation. A feature listed here is not yet built. Before
coding any feature from this folder, follow `AGENTS.md`: contract changes need a short ADR, impact
assessment, tests, and human review.

## Template (used for every feature file)

1. **Source** — spec file + section number
2. **Status** — Core / Proposed enhancement, and Tier (1/2/3) per Section 37
3. **Portal mapping** — which portal(s)/roles see or use it
4. **Working / flow** — step-by-step logic
5. **Functionality impact** — what existing entities, tasks (T-numbers), or scenarios (S-numbers) in
   `tasks.md` it touches or depends on
6. **Constraints / guardrails** — relevant `AGENTS.md` rules or stop-conditions that apply
7. **Open questions** — things not defined by the source that need a product/domain decision

## Feature index

| # | Feature | Source section | Tier | Portal | File |
|---|---|---|---|---|---|
| 0 | Core Product Entities (foundation) | PARVA §2 | — (cross-cutting) | All | [00-core-entities-mapping.md](00-core-entities-mapping.md) |
| 1 | What-If Disaster Simulator | PARVA §3 | 1 (MVP) | Government Command Center | [01-what-if-disaster-simulator.md](01-what-if-disaster-simulator.md) |
| 2 | Mission entity — ADR draft (Mission Management prerequisite) | PARVA §2.5 / §12 | 1 (MVP, per PARVA; deferred per tasks.md) | Government + Logistics | [02-mission-entity-adr-draft.md](02-mission-entity-adr-draft.md) |

Features get added here one at a time, in the order they are analyzed — not all at once.
