# Feature 1: What-If Disaster Simulator

## 1. Source
`PARVA_Complete_Feature_Functionality_and_Working_Specification.md`, Section 3 (also Sections 4-7 for
the three concrete scenario types and the shared impact-chain engine).

## 2. Status
Tier 1 — Core Demo/MVP (per Section 37). Not explicitly named in the original SIH statement; it is the
product's proposed realization of the statement's "AI-based route intelligence" + emergency/disaster
accessibility requirements, generalized into a hypothetical/pre-event mode.

Cross-reference: this is not a new idea in the repo — `tasks.md` already scopes it as **T23**
("snapshot what-if and reachability refinement", optional, 3-5 days, depends on T22) and as release
scenario **S13** ("Scenario branch: hypothetical 12-hour closure changes only scenario results, never
live road accessibility"). Treat PARVA §3-7 as the detailed UX/behavior spec for T23, not as a new task.

## 3. Portal mapping
- **Government Command Center** — primary and only home. Section 33's nav list has an explicit
  "What-If Simulator" entry.
- **Users**: MDoNER, State authority, District authority, Emergency authority (all "commander" roles).
- **Field Operations App**: not present. Field officers do not run simulations.
- **Logistics & Transport Portal**: not present as a page, but simulation *output* references
  Logistics entities (missions, shipments, vehicles) read-only — a dispatcher would see the same
  mission ID referenced in a simulation result, but cannot trigger or approve simulations from that
  portal.
- **Emergency Mode** (Section 36 nav): no dedicated "What-If" entry, but its "Resilience Plans" and
  "Critical Missions" sections are the downstream consumers of a simulation's AI recommendations once
  a real (non-hypothetical) version of the same event occurs.

## 4. Working / flow
```
Open Simulator
  -> Select scenario (Flood | Landslide | Bridge Failure)
  -> Select location / route / asset
  -> Configure severity + affected area + duration
  -> Run simulation
  -> Impact engine evaluates consequences (reuses the same impact-chain logic as live incidents)
  -> Results displayed, tagged SIMULATED
  -> AI generates recommendations (Section 11) for commander review
```
Output is grouped into 4 categories: Infrastructure (roads/bridges blocked), Geography (isolated
villages/districts/hospitals), Logistics (delayed shipments/missions/vehicles), Risk (route/mission/
supply risk deltas).

Each of the 3 concrete scenarios (Sections 4-6) is the same flow with a different input shape:
- **Flood**: location + severity/zone -> infrastructure + isolation + logistics impact.
- **Landslide**: single road blockage -> alternate route availability -> downstream vehicle/mission/
  hospital/village impact.
- **Bridge failure**: bridge selection -> disconnected routes -> network-level impact (this one is the
  most structurally different since it operates on graph connectivity rather than a zone/severity
  input).

## 5. Functionality impact (dependencies on existing contracts)
- **Depends on T10** (deterministic constrained routes / pgRouting) — the simulator needs to run
  routing against a *frozen snapshot* of the graph with hypothetically-closed edges, not the live
  graph.
- **Depends on T14** (incident-to-impact worker) — the "impact engine" mentioned in Section 3/7 is the
  same impact-chain computation already built for live incidents; this feature is a second caller of
  it in snapshot mode, not a new engine.
- **Feeds Section 11 (Scenario-Based AI Recommendations)** and **Section 14 (AI Resilience Plan
  Generator)** — those are separate features/files to be analyzed later; What-If is their primary
  trigger in "explore before it happens" mode (the other trigger being a real live incident).
- **GIS impact**: requires a distinct, clearly labeled **SIMULATION layer** on the map (Section 4),
  separate from the live risk-zone layer, so a viewer cannot mistake a hypothetical closure for a real
  one.
- **Data model impact**: implies a `Scenario` / snapshot object distinct from live `Incident` — it must
  produce a scenario ID, not mutate any Road/Route/Bridge status row.

## 6. Constraints / guardrails (from AGENTS.md)
- Directly matches the stop-and-escalate condition: *"Stop when a requested operation would reopen a
  road without authority... or substitute a model output for a dispatch decision."* The simulator's own
  rule text makes this explicit: *"Simulation must be visually separated from live data and must never
  silently overwrite real operational status."*
- "AI recommends, human approves" principle (PARVA §20) applies to anything the simulator's AI
  recommendation step (§11) proposes — no auto-execution.
- Per AGENTS.md, treating this as a contract change (new entity type + new API surface) requires a
  short ADR + impact assessment before implementation, even though `tasks.md` already reserves T23 for
  it.

## 7. Open questions (not defined by source, need product/domain decision)
- Exact severity scale/units for "High/Medium/Low" per scenario type (Flood severity vs. Landslide
  severity may need different underlying parameters).
- How long a scenario snapshot is retained/replayable (audit vs. storage cost).
- Whether Bridge Failure simulation needs its own connectivity algorithm (likely graph articulation
  point / bridge-detection) versus reusing the same edge-closure routing used for Flood/Landslide.
- Who is authorized to run a simulation (all commander roles, or district-scope-limited only within
  their own scope per the platform's core scoping principle).
