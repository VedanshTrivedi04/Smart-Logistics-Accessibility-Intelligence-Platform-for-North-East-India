# Feature 0: Core Product Entities (foundation, not a standalone feature)

## 1. Source
`PARVA_Complete_Feature_Functionality_and_Working_Specification.md`, Section 2 (2.1–2.12).

## 2. Status
Foundational / cross-cutting. This is not a UI feature — it is the entity list every later PARVA
feature (Mission Management, Supplier Switching, Resilience Plans, What-If Simulator, etc.) assumes
exists. It must be reconciled against `systemdesign.md`'s **Data model** table (the authoritative
schema contract per `AGENTS.md`) before any dependent feature is implemented.

Numbered `00` (not `01`) because it precedes and underlies feature 01 in the index, not because it was
analyzed after it chronologically.

## 3. Entity-by-entity mapping against `systemdesign.md`

| PARVA entity (§2) | Existing table in `systemdesign.md` | Verdict |
|---|---|---|
| 2.1 Region (NER→State→District→Local Area) | `jurisdictions` (parent_id hierarchy, versioned boundaries) | **Already covered.** Hierarchy is generic parent_id, not literally 4 fixed levels — fine, more flexible. |
| 2.2 Road / Route | `road_edges`/`road_nodes` (physical topology) **+** `route_plans`/`route_plan_edges` (a computed path for a trip) | **Partially covered, naming conflated.** PARVA treats "Route" as one entity with an ID, origin/destination and alternates. The existing design deliberately *splits* this into (a) the physical graph (road_edges) and (b) an immutable, versioned computed route (route_plans) tied to a specific trip/snapshot. This split is intentional per the Routing algorithm section (snapshot solver, not live-mutable). Do not collapse them to match PARVA's simpler model — flag this as a terminology mapping for future feature docs, not a schema gap. |
| 2.3 Bridge | `bridges`, `bridge_edges` | **Already covered**, 1:many with edges as PARVA describes. |
| 2.4 Incident | `incidents`, `incident_reports`, `incident_edges`, plus `reports` (raw observation) | **Already covered, and more rigorous.** PARVA's single "Incident" concept is actually split into raw `reports` (unverified observation) → `incidents` (reviewed, lifecycle-tracked). This matches the domain rule in `systemdesign.md` that a report and a verified incident are different objects — keep this distinction when implementing anything from PARVA that says "Incident." |
| 2.5 Mission | **None.** No equivalent aggregate object exists. | **Gap.** `trips` + `deliveries` cover parts of it (vehicle+route+cargo+ETA+state) but there is no single row that bundles cargo, vehicle, route, supplier, destination, priority, ETA, risk and status as one addressable object the way PARVA's Mission examples (`MISSION M102`) do. This is the largest structural gap — see Section 5. |
| 2.6 Vehicle | `vehicles`, `devices`, `vehicle_device_assignments`, `positions`, `vehicle_latest_position` | **Already covered**, and more detailed (device/vehicle separation, GPS sequence integrity) than PARVA specifies. |
| 2.7 Delivery / Shipment | `deliveries` | **Already covered.** |
| 2.8 Supplier | **None.** | **Gap.** No supplier/org-as-goods-source table exists. `organizations` exists but represents government units and operators, not goods suppliers. PARVA itself flags this: "Supplier management is introduced by the project transcript and is not explicitly detailed in the original SIH statement" (§15). |
| 2.9 Hospital | `facilities` (generic, has a `kind` column) | **Covered via generic modeling**, not a dedicated table. Requires `kind = HOSPITAL` (or similar) to exist in the facilities kind enum, plus whatever hospital-specific fields (active medicine missions, estimated supply delay per §28) get modeled as a *view/projection* over missions+facilities, not new facility columns. |
| 2.10 Village / Community | Ambiguous — closest existing concept is `facilities` (point) or `jurisdictions` (area, kind=local_area) | **Gap / ambiguous.** A village is a settlement/population area, not a single-point service like a hospital or warehouse. Isolation risk (§8, §28) is a *connectivity* result against the road graph, not a facility property. Needs a product decision: is "Village" a new lightweight point/area entity, or is it just a `jurisdictions` row at the lowest level plus a population/settlement attribute? Do not default to piggy-backing on `facilities` without this decision — it changes how isolation analysis queries the graph. |
| 2.11 Weather Condition | `weather_observations` | **Already covered.** |
| 2.12 Resilience Plan | **None.** | **Gap.** No plan/action-bundle table exists. `dispatch_decisions` is the closest existing concept but it is scoped to a single trip + a single route_plan (accept/reject one recommendation), not a multi-action coordinated plan (route change + supplier switch + ETA update + notification) with its own lifecycle (Draft→Pending Approval→Approved→Executing→Completed→Evaluated per §29). This is a new entity, not an extension of dispatch_decisions. |

## 4. Functionality impact
Three entities are genuinely new and not representable by extending existing tables without a real
schema change: **Mission**, **Supplier**, **Resilience Plan**. Every Tier-1/Tier-2 PARVA feature that
references them is blocked on this decision, specifically:
- Mission Management, Mission Risk Assessment, Active Mission Dashboard (need `Mission`)
- Supplier Management, Supplier Reliability, AI-Based Supplier Switching (need `Supplier`)
- AI Resilience Plan Generator, Unified Resilience Plan Object, Human Approval workflow (need
  `Resilience Plan`)

One entity is a naming/conceptual mapping issue, not a schema gap: **Road/Route** — future feature docs
should say "road_edges" vs "route_plans" explicitly rather than reusing PARVA's undifferentiated
"Route," to stay consistent with the snapshot-based routing model already designed.

One entity needs a product decision before schema design: **Village/Community** — point vs. area
representation changes the isolation-analysis query shape.

## 5. Constraints / guardrails (from AGENTS.md)
- "Changes to any contract require a short architecture decision record, impact assessment, tests and
  human review." Adding `missions`, `suppliers`, and `resilience_plans` tables to `systemdesign.md` is a
  contract change and needs an ADR before implementation — not just an inferred addition.
- "Do not silently introduce microservices, extra portals, a different database or frontend-side
  authorization." — Mission/Supplier/Resilience Plan must be added as tables in the existing
  PostgreSQL/PostGIS schema, following the same UUID/created_at/version-counter conventions already
  used, not a separate store.
- "A schema change includes an Alembic migration with upgrade evidence." applies once these are
  implemented.
- Recommended sequencing per `AGENTS.md`'s "Post-pilot growth order" (in `tasks.md`): the pilot's
  existing plan explicitly defers exactly this kind of expansion — "add critical-facility isolation and
  what-if comparison, then inventory-aware priority if trustworthy stock data exists" — i.e. Mission/
  Supplier/Resilience Plan are legitimately *after* the MVP vertical slice (T00–T22), not a should-add-now
  item, even though PARVA's own Tier list calls Mission Management "Tier 1."

## 6. Open questions (need product/domain decision)
- Is `Mission` a new top-level table that `trips` and `deliveries` attach to (mission_id FK on trips),
  or is it a read-side aggregation/projection over existing trips+deliveries+route_plans with no new
  write path? This materially changes T11 (vehicle/trip/delivery contracts) if missions become a
  required wrapper.
- Supplier table's relationship to `organizations` — is a Supplier a kind of `organization`, or a
  separate entity entirely (a supplier may not be a platform user/org at all, just a referenced record)?
- Resilience Plan's relationship to `dispatch_decisions` — does approving a Resilience Plan create one
  dispatch_decision per action, or is it a new parent table with dispatch_decisions as one of several
  child action types (route change vs. supplier switch vs. notification are structurally different
  actions)?
- Village/Community: point entity, area entity (extending `jurisdictions`), or a new lightweight
  `settlements` table with its own geometry and a link to nearest road node for isolation analysis?
- Whether "Tier 1" in PARVA's own priority list (Section 37) should be re-negotiated against the
  existing `tasks.md` sequencing, since PARVA's Tier 1 includes Mission Management which the current
  plan treats as post-pilot growth.
