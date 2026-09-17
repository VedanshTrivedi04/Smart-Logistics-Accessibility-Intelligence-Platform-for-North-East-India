# System architecture

## Architectural decision

Use a modular FastAPI monolith and independently runnable worker from the same backend repository. One Next.js application initially hosts /government, /field and /logistics route segments with shared UI and a field PWA experience. Three experiences do not require three backends, databases or deployments.

Keep PostgreSQL/PostGIS as the source of truth. Add pgRouting for the pilot graph if the deployment supports the extension; validate this first. Do not quietly switch algorithms or introduce a route provider that cannot honor live hard closures. Keep Redis as transport/cache, never the only record of an accepted report, road decision or alert.

## Component diagram

~~~mermaid
flowchart TD
    G[Government portal] --> N[Next.js app and HTTPS ingress]
    F[Field PWA and IndexedDB queue] --> N
    L[Logistics portal] --> N
    N --> A[FastAPI REST and SSE]
    A --> P[(PostgreSQL and PostGIS)]
    A --> O[Private object storage]
    P --> W[Outbox dispatcher and workers]
    W --> P
    W --> R[Redis queue and transient cache]
    W --> I[Weather and alert adapters]
    T[Authenticated GPS provider] --> A
    W --> C[Notification channel adapters]
    A --> S[Scoped SSE invalidations]
    S --> N
~~~

The diagram shows logical dependencies, not each transport connection. Workers consume tasks through Redis/Celery while a PostgreSQL outbox preserves work durably. Notifications and SSE are projections of committed state.

## Stack responsibilities

| Layer | Selected approach | Reason / restriction |
|---|---|---|
| HTTP backend | FastAPI + Pydantic + REST | Explicit typed contracts and generated OpenAPI |
| Persistence | SQLAlchemy + Alembic | Unit-of-work transactions and reviewed migrations |
| Spatial data | PostgreSQL + PostGIS + pgRouting | Relationships, spatial indexes and dynamic graph filtering |
| Background work | Celery + Redis, PostgreSQL outbox | At-least-once work with recoverable source of truth |
| Frontend | Next.js App Router + TypeScript | Shared role surfaces and isolated client interactions |
| Server data UI | TanStack Query + generated API client | Scoped cache keys, retries and invalidation |
| Maps | MapLibre GL JS + licensed tiles | Rendering separate from routing truth |
| Offline | Service worker + IndexedDB/Dexie | Bounded local queue; foreground replay mandatory |
| Media | Private S3-compatible storage | Upload lifecycle, checksums and scanning |
| Identity | OIDC provider via backend auth/session | Central identity, MFA for privileged users |
| Observability | Structured logs, metrics, traces | Correlate API, outbox, jobs and alert outcomes |

Names are proposed dependencies, not claims that a particular latest version combination was tested. Task T01 locks supported versions only after running FastAPI/Pydantic/SQLAlchemy/Alembic and Next.js/PWA/build compatibility checks. Use lockfiles and pinned container image digests. An OIDC service is deployment infrastructure, not a replacement for backend authorization.

## Repository layout

~~~text
README.md
agents.md
skill.md
superpowe.md
systemdesign.md
systemarchitecture.md
tasks.md
projecteresearch.mnd
backend handover.md
frontendhandoever.md
backend/
  boundries.py
  workflow.py
  pyproject.toml
  alembic.ini
  alembic/versions/
  app/
    main.py
    core/                 # configuration and neutral primitives
    modules/
      identity/
      network/
      reporting/
      incidents/
      logistics/
      telemetry/
      routing/
      impact/
      alerts/
      integrations/
      audit/
      <module>/
        api/
        domain/
        application/
        infrastructure/
        public.py         # explicit public module contract
    workers/
  tests/
    unit/
    integration/
    contracts/
frontend/
  boundries.py
  workflow.py
  package.json
  pnpm-lock.yaml
  src/
    app/
      government/
      field/
      logistics/
    features/
      incidents/
      reporting/
      routing/
      fleet/
      deliveries/
      alerts/
      <feature>/index.ts  # public feature exports
    shared/
      api/generated/
      ui/
      auth/
      map/
      offline/
  tests/
infra/
  compose.yaml
  deployment/
  monitoring/
contracts/
  openapi.json
  fixtures/
~~~

Paths with <module> or <feature> describe patterns, not literal directory names. This pack does not contain the future application tree or configs. Shared UI contains no business authority logic. Shared offline primitives manage storage/retry, while reporting owns report-specific payload behavior.

## Module dependency direction

Domain is pure business logic with standard-library/value types; it cannot import FastAPI, ORM, HTTP clients, Celery, Redis or other modules. Application orchestrates domain and declared ports; it cannot depend on infrastructure or API. Infrastructure implements application ports and persistence. API depends on application DTO/use cases, not ORM sessions or provider implementations. main.py wires implementations to ports.

Cross-module imports are through the other module's public.py contract only. Prefer immutable DTOs and service interfaces, never exported ORM entities. Domain emits facts; application persists and publishes them through the outbox. Core must not import modules. Architecture checkers enforce a subset of this structure; tests and review enforce behavioral boundaries.

Frontend app composes feature public exports and shared building blocks. A feature may use shared code and its own internals, but another feature only through its index.ts public entrypoint. Shared code cannot import features or app. Browser bundles cannot import backend paths, database clients or server secrets. Sensitive operations always traverse FastAPI authorization.

## Transaction and event flow

Review transaction: lock/read the current report revision, authorize against database grants, reject self-verification, insert immutable review decision and any edge-status events, bump status version, write audit and outbox, commit. Expensive impact work happens after commit. The UI can show impact_pending until processed.

Outbox dispatcher claims bounded rows with locking, publishes event IDs and records publication attempts. A crash before/after publishing can cause duplicate delivery, so consumers keep unique (consumer,event_id) receipts and side effects in one transaction. Failed events retry with backoff and an observable dead-letter status. Replay is an authorized operation with a reason.

Routing reads a consistent graph and status version. Impact workers use aggregate versions to avoid older events overwriting newer projections. Cache keys include graph/status/policy version and authorized request context where private data exists. Redis loss permits cache rebuild and outbox replay; it must not lose committed observations.

Notification sending uses a stable dedup key and provider idempotency where available. Delivery ambiguity is recorded; no unsupported exactly-once guarantee for external SMS/email. Reconcile provider receipts and do not confuse them with human acknowledgement.

## Identity and trust boundaries

Browser -> ingress -> FastAPI -> PostgreSQL is the normal data path. OIDC callback and session handling are backend-owned. Secure HttpOnly SameSite cookies use HTTPS, CSRF checks and short session lifetimes with server-side revocation. SSE uses the same authenticated same-origin path, no access tokens in query strings.

Device/provider ingestion has separate credentials, limited endpoints, rotating secrets, replay protection and rate limits. Signatures are verified against the provider's actual contract. Machine credentials cannot access government pages or mark a road verified.

Use application authorization plus RLS on private organization/user-owned tables. Public/shared network data is governed separately. Runtime DB role must not own tables or have BYPASSRLS. Do not implement government sharing by disabling RLS. Transaction-local identity/scope context must come from validated grants, not an arbitrary incoming header.

Media is quarantined on upload, size/MIME/checksum validated, malware scanned where configured and stripped of unnecessary metadata for display derivatives. Original evidence retention requires an approved purpose/access policy. Signed download URLs are short-lived and issued only after current authorization. Recheck report linkage and ownership; possession of an object ID is not authorization.

## Offline and real-time constraints

Cache the minimal static field shell and licensed offline map assets, not the entire authenticated site. Scope IndexedDB records to identity and test service-worker upgrades without losing a pending queue. Offline map packs are optional for MVP; report capture must work with coordinates and text even if no tiles exist.

SSE carries resource invalidation IDs and minimal authorized summaries. Reconnect with a cursor and deduplicate IDs. If the event cursor is outside retention, return a resync instruction and reload REST state. Permissions must be rechecked on subscription/reconnect and revoked sessions closed within the configured session-check interval. Start with REST polling fallback to avoid depending on continuous mobile connectivity.

A location marker displays last event time, age and uncertainty. Do not animate extrapolated movement as observed GPS. Out-of-order fixes can enter history but cannot overwrite a newer current position. Quarantine impossible speeds/coordinates and clock-skew anomalies with source evidence.

## Deployment and operational targets

Development uses containers for PostgreSQL/PostGIS/pgRouting, Redis and S3-compatible storage plus local API/frontend/worker processes. CI runs isolated disposable databases. Staging mirrors extensions, proxy settings, CORS/session behavior and object access. Pilot production should use managed database/backups and restricted network access where practical; choose hosting only after data-policy and procurement review.

Deploy frontend, API and workers separately from the same release manifest. Run migrations as a controlled one-off job before serving schema-dependent code. Prefer expand/backfill/contract migrations so old/new releases can overlap. Never run migrations independently from every API replica.

Baseline production safeguards: secret manager, TLS, non-root containers, least-privilege storage/database identities, dependency and image scanning, structured redacted logs, database backups with PITR, object versioning where approved, encrypted backups and audited admin access. Kubernetes is unnecessary for the pilot unless already supplied by the host organization.

Metrics: API latency/errors, database pool saturation, query duration, outbox age, job retries/dead letters, adapter last success and freshness, unknown-edge coverage, telemetry event delay, sync duplicate/conflict rate, notification failures and acknowledgement delay. Traces connect request_id to event_id without logging raw personal data.

Alert on missing feed freshness, growing outbox age and stale fleet coverage, not only process crashes. Operators need a degrade-mode banner, ability to pause advisory publication, approved manual review procedure and recovery runbook. A restore drill verifies database + object references + outbox recovery together.

## Capacity and retention assumptions

The benchmark in systemdesign.md is a synthetic sizing target. At 100 vehicles every 15 seconds, one fully connected day produces 576,000 positions; indexes and retained raw payloads add substantial overhead. Estimate storage from measured row/index size, operating hours, retention and replication rather than quoting an untested cloud cost.

Proposed discussion defaults: raw positions 30 days, coarsened operational summaries 180 days, rejected/unused uploads 7 days and idempotency response cache 30 days. Durable report operation mappings persist with their reports. Evidence, incident and audit retention needs authority/legal approval; do not purge it using these tentative defaults. Approved erasure must address replicas, derivative exports and backup expiration, with lawful retention exceptions documented.

## Architecture decisions and alternatives

ADR-01 modular monolith: less operational overhead than microservices; split only when independent scaling or ownership is measured.
ADR-02 PostGIS/pgRouting: one source of spatial/business truth; limitation is validated graph-building and database capacity.
ADR-03 transactional outbox: durable event chain despite queue failures; accept at-least-once processing complexity.
ADR-04 PWA field reporting: reuse Next.js; limitation is browser storage/background execution, with native telemetry separate.
ADR-05 deterministic advisory first: explainable and testable; does not fulfill validated ML accuracy claims.
ADR-06 three role surfaces in one app: reuse design system; separate deployments later only for real operational constraints.
ADR-07 no automatic dispatch: recommendations require operational authority and fresh revalidation.
