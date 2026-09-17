# Backend engineering handover

## Current handover state

Delivered: researched contracts, domain design, task sequence and development-time Python check scripts. Not delivered: a running FastAPI application, database migrations, installed dependencies, functioning provider connections, production identity or a trained model. Begin with T00-T04, not by assuming the described modules already exist.

The required stack remains FastAPI REST, Pydantic, Alembic and PostgreSQL. Proposed additions are SQLAlchemy, PostGIS/pgRouting, Celery/Redis and private object storage. Implement one shared modular backend serving all three frontend surfaces.

## Bootstrap checklist

Create backend/pyproject.toml with pinned compatible dependencies and lint/type/test configuration; configure an isolated environment and reproducible lockfile. Add app/main.py, neutral core configuration, module skeletons, tests and Alembic. Bring up the development database with approved spatial extensions, Redis and object storage. Establish readiness checks and redacted structured logs before domain features.

The workflow.py script expects ruff, mypy and pytest available in the active Python interpreter. It expects pyproject.toml, alembic.ini, app/main.py and at least one test_*.py under backend/tests. It does not install packages or run migrations automatically. Integration tests must manage disposable databases and perform migration upgrade checks safely.

Example future environment keys: DATABASE_URL, REDIS_URL, SESSION_SECRET, OIDC_ISSUER, OIDC_CLIENT_ID, OIDC_CLIENT_SECRET, OBJECT_STORAGE_ENDPOINT, OBJECT_STORAGE_BUCKET, OBJECT_STORAGE_ACCESS_KEY, OBJECT_STORAGE_SECRET_KEY, ALLOWED_ORIGINS, WEATHER_PROVIDER, WEATHER_CREDENTIAL_REF, GPS_PROVIDER and ENABLE_DEMO_FIXTURES. These are proposed names, not actual secret values. Keep provider secrets out of the browser.

## Implementation sequence

1. Establish session authentication, CSRF checks and capability/scope resolution. Create non-owner runtime DB identity and negative RLS tests.
2. Implement network/facility schemas and graph validation before route results. Use versioned imported fixtures with provenance.
3. Implement report/media and operation-id uniqueness, then verify/reject decisions with no-self-review and optimistic concurrency.
4. Add outbox/audit in the same transaction as domain writes. Add lag/error metrics before creating event-driven side effects.
5. Implement trips/deliveries and one authenticated telemetry adapter or explicitly labelled simulator.
6. Add constrained snapshot routing and revision-bound dispatch decisions, then exact incident-to-impact joins.
7. Add provider adapters, source health, scoped alerts and SSE invalidation. Realistic outage tests precede pilot release.

## Transaction ownership

Route handlers receive validated input and the current principal, call one application use case and serialize a Pydantic DTO. Application use cases own the unit of work. Repository methods must not issue hidden commits. Keep review decisions, status events, audit, durable sync mapping and outbox writes atomic where they belong to the same use case.

A worker transaction claims/deduplicates an event, applies its projection and writes the consumer receipt atomically. External notification calls cannot share a database transaction; use pending attempts with reconciliation and provider idempotency where supported. Never promise exactly-once delivery to an external provider.

## API conventions to freeze first

Freeze report submission/review, sync results, route result and alert-action schemas early; frontend work depends on these. Use /api/v1, generated OpenAPI, ISO-8601 UTC, GeoJSON longitude/latitude and explicit numeric units. The systemdesign.md API table is normative for the pilot proposal.

For unsafe browser methods require session + CSRF + Origin validation. Require Idempotency-Key for report creation and stable client_operation_id for synchronization. Support If-Match versioning on reviews, assignments and status changes. Resolve principal/organization from validated sessions, not trusted payload fields.

Validate maximum coordinates, dates/clock skew, media count/size, description lengths, telemetry batch sizes, route search area and bbox extent. Return stable typed errors; do not expose raw SQL/provider exceptions. GET list endpoints and aggregate endpoints must enforce identical ownership/sharing constraints to object detail routes.

## Provider interface sketch

WeatherProvider.fetch_since(cursor) returns normalized records and a next cursor; each record carries provider identity, issued/observed/valid/received times, location/coverage, units and raw-reference provenance. AlertProvider uses an equivalent cursor contract plus update/cancel references. GPSProvider verifies the actual provider's authentication format before mapping device identity and normalized fixes.

Adapters own HTTP details, bounded timeouts, backoff and source validation. Domain logic cannot import an HTTP client. Provider credentials and endpoint allowlists are configuration, not user-supplied URLs. Do not use unrestricted remote photo fetches or unvalidated webhook destinations.
TranslationProvider.translate(text, source_lang, target_lang) and
TranslationProvider.synthesize_speech(text, lang) return normalized results
with provider identity, request/response latency and a confidence/coverage
flag; unsupported language codes return an explicit not_supported result,
never a silent English fallback presented as translated.

## Database checklist

Create spatial indexes and ownership/time/status indexes; demonstrate query plans on target graph/position volumes. Apply unique constraints for report operation IDs, device sequence, external alert identity and outbox consumer receipts. Partition position history when justified by benchmark/retention. Avoid partition schemes that accidentally invalidate dedup uniqueness; keep a separate short-lived device replay ledger or enforce an appropriate compound key across the chosen scheme.

Store append-only review/status/audit events and rebuildable current projections. Keep source evidence references and network version. Document deletion and retention per data class before enabling purge jobs. Separate migration credentials from runtime and never use SQLite to claim PostGIS/RLS integration tests passed.

## Worker jobs

- ingest_weather and ingest_external_alerts validate and normalize approved sources, expose last success and coverage.
- recompute_impact consumes committed status changes, uses version guards and distinct affected trip/delivery sets.
- publish_alerts creates deduplicated scoped alerts with audience, owner and severity policy.
- deliver_notifications retries provider failures and records ambiguous outcomes independently from acknowledgement.
- dispatch_outbox and reconcile_failed_jobs recover durable work; admin replay is audited.
- expire_evidence marks stale/unknown and queues review; it never reopens a blocked road automatically.
- cleanup_uploads removes only eligible unreferenced/quarantined objects under approved retention policy.
- translate_notification_templates pre-translates approved templates per
event code and language at template-approval time, not per-alert at send
time, so emergency wording is reviewed once, not machine-translated live.

## Testing and observability

Required unit tests: lifecycle transitions, priority override authority, route hard constraints, evidence expiry, duplicate operations and policy explanations. Required integration tests: RLS as non-owner, rollback/outbox atomicity, same-key races, out-of-order GPS, safe graph snapping, scoped impact and Alembic fresh/upgrade paths. Required contracts: authorized real samples or clearly identified synthetic substitutes and generated frontend client compatibility.

Instrument API p95, DB pool, adapter age, outbox lag, worker retries, unknown coverage and alert acknowledgement age. Error logs include request/event correlation and redacted resource summaries, not raw photos, GPS trails, session cookies or contact lists.

## Deployment handoff

Provide a deployment manifest, environment-key reference, locked dependencies, database extension compatibility record, migration plan, rollback/forward-fix procedure, health routes, backup/restore evidence, secret rotation procedure and known provider limitations. Test migrations against staging data shape before enabling workers on the new schema. Do not run production alembic downgrade as a generic rollback tactic.

## Backend handover acceptance

The receiving engineer must be able to provision a clean local environment, create schema through migrations, seed a labelled corridor, execute a report/review/closure/impact scenario, inspect logs/metrics and run unit/integration/contract suites. Until these occur, the project remains a design-stage handover.
