# ADR Draft: Add `missions` as a new core entity

Status: **DRAFT — not yet reviewed or approved.** Per AGENTS.md, changes to `systemdesign.md` or
`tasks.md` (the contract files) require this kind of short ADR plus impact assessment, tests, and
human review before implementation. This file is the proposal; it does not itself change any contract.

## 1. Problem
PARVA §2.5 (Mission Management, Tier 1) requires a single addressable object bundling cargo, vehicle,
route, supplier, destination, priority, ETA, risk and status. `memory/00-core-entities-mapping.md`
identified this as a genuine schema gap: no such table exists today. `trips` + `deliveries` cover parts
of it but there is no row a commander can point at and call "Mission M102."

## 2. Decision
Add `missions` as a new **parent aggregate table**, referencing existing entities rather than
duplicating their fields.

```
missions
  id                     UUID PK
  org_id                 FK -> organizations
  objective              text                 -- e.g. "Deliver medicines to Remote Hospital A"
  origin_facility_id     FK -> facilities (nullable)
  destination_facility_id FK -> facilities (nullable)
  supplier_id            UUID (nullable, no FK constraint yet -- suppliers table does not exist)
  priority               enum (CRITICAL, HIGH, NORMAL)   -- mirrors deliveries.priority reason pattern
  status                 enum (CREATED, ASSIGNED, IN_TRANSIT, AT_RISK, RESILIENCE_PLAN, ADJUSTED, DELIVERED)
  created_at, updated_at, version

trips.mission_id         nullable FK -> missions   -- MVP: one mission has at most one trip
```

Cargo, vehicle, ETA, and route stay on `trips`/`deliveries`/`route_plans` exactly as designed today.
`missions` links to them; it does not copy their columns. This preserves the existing "no separate
duplicated source tables" rule already stated in `systemdesign.md`'s permissions section.

Mission risk (PARVA §13) is deliberately **not** part of this ADR — it is a derived computation (route
risk + weather + supplier + vehicle + destination factors) that should be a read-side projection, not a
stored column that can drift from its inputs. It gets its own ADR once the scoring approach is defined
(open question already flagged in `memory/00`).

## 3. Why not alternatives
- **Projection-only (no new table, compute Mission as a view over trips+deliveries+route_plans):**
  rejected — a mission must be independently createable before a trip/vehicle is assigned (lifecycle
  starts at CREATED, trip assignment happens at ASSIGNED per PARVA §12), so it needs its own identity
  and row, not just a query over already-assigned records.
- **Duplicate cargo/vehicle/route fields onto missions:** rejected — violates the existing single-
  source-of-truth data model and would require dual-write consistency logic with no benefit.
- **Hard (non-nullable) FK trips→missions:** rejected for MVP — would force every existing/future trip
  to have a mission, which is a bigger behavior change than this ADR scopes. Nullable FK keeps this
  additive and backward compatible.

## 4. Impact assessment
- **Schema**: one new table, one nullable FK column on `trips`. Additive, non-breaking. Needs an
  Alembic migration with upgrade evidence per AGENTS.md's schema-change rule.
- **Permissions**: needs new rows in `systemdesign.md`'s permissions matrix — who can create a mission
  (likely delivery coordinator / fleet manager, mirroring existing trip/delivery creation rights) vs.
  who can only view (government roles, scoped same as today's dashboard/impact views).
- **API**: new endpoints needed — `POST /missions`, `GET /missions`, `GET /missions/{id}`, and a status-
  transition endpoint (`POST /missions/{id}/status-decisions`, mirroring the existing
  `incidents/{id}/status-decisions` pattern for consistency).
- **Domain rules**: the CREATED→ASSIGNED→IN_TRANSIT→AT_RISK→RESILIENCE_PLAN→ADJUSTED→DELIVERED lifecycle
  must be enforced in a backend domain service, not in the Next.js frontend or FastAPI router directly
  (AGENTS.md: "Keep domain rules in backend services/domain modules").
- **tasks.md**: needs a new task entry (not a renumbering of existing T-numbers) depending on T11
  (vehicle/trip/delivery contracts). Sequencing question: PARVA calls this Tier 1, but `tasks.md`'s
  existing "Post-pilot growth order" defers exactly this kind of entity expansion until after the pilot
  vertical slice (T00-T22) is proven. This ADR does not resolve that scheduling conflict — that is a
  product-owner decision, not an engineering one.
- **Frontend**: new Mission Dashboard page (PARVA §23) — active/completed/delayed/at-risk/critical/
  disrupted filters by status/priority/district/cargo/risk.

## 5. Required reviewers (per AGENTS.md work-allocation table)
- Domain lead — sign off on status semantics and lifecycle transitions
- Backend engineer — schema/migration and API design
- Security/database review — before merge, per the "Definition of a complete pull request" section

## 6. Open items this ADR intentionally does NOT resolve
- Mission risk scoring formula/inputs (separate ADR)
- Supplier FK enforcement (blocked on the separate Supplier entity ADR)
- Whether Mission creation should be allowed to happen before a trip exists at all, or always requires
  an existing trip to attach to (affects whether `missions.origin/destination` are redundant with a
  future trip's own facility references)
- Exact placement in `tasks.md`'s sequencing (product-owner decision: pull forward from post-pilot
  growth order, or keep deferred as currently planned)

## 7. Status of this document
Draft only. Do not treat as approved. No code, migration, or contract file has been changed as a result
of this ADR yet.
