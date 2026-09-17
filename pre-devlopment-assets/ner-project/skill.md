# Engineering skills and working recipes

## FastAPI service slice

Define the use case and permission first. Add Pydantic input/output schemas with strict enums, bounded strings and timezone-aware timestamps. Route handlers authenticate, authorize and invoke application services; they do not commit midway through a business operation. A service owns the unit of work, writes audit/outbox records in the same transaction and returns an explicit DTO. Repositories express scoped queries. External requests run through bounded-timeout adapters, preferably workers when not essential to the synchronous response.

Test valid input, missing authorization, wrong organization, wrong district, replay, concurrent writes, transaction failure and documented error shape. Generate OpenAPI and update the client before shipping the endpoint.

## PostgreSQL and Alembic

Use UUID keys, named constraints, FK indexes and appropriate uniqueness. Store UTC timestamps; render local time in the UI. Geometry uses SRID 4326; metric distance queries use geography or a reviewed projection rather than degrees. Add GiST indexes for spatial queries and B-tree indexes for ownership/state/time filters. Inspect EXPLAIN plans on representative fixtures.

Use an independent migration role and a non-owner runtime role. For pooled connections, set authorization context transaction-locally and clear it by transaction completion. Default deny when context is absent. RLS tests must use the runtime role. No destructive migration without a backup/forward-repair strategy. Test both fresh installation and upgrade from the previous release.

## Road network and routing

Import only approved/attributed data. Split roads at valid junctions while respecting bridges, layers, one-way rules and grade-separated crossings. Keep stable internal identifiers and external source mappings. Connect bridges to traversing edges. Preserve topology version and changes.

Resolve origin/destination to plausible graph points with a bounded snapping distance and snap metadata; reject unsafe or ambiguous snaps. Apply access, dimension, load and verified-closure rules before computing travel cost. Return no feasible route rather than relaxing hard restrictions. Use route overlap analysis to produce meaningfully different alternatives, not merely renamed paths.

## Reliable field capture

Persist a local draft transactionally in IndexedDB before showing Saved on device. Generate client operation UUIDs. Store timestamps and location accuracy with the observation. Keep photos as staged local objects with bounded storage usage and visible cleanup controls. Upload/resume media separately, then submit the report with completed owned media IDs. For an urgent text-only report, submit without media and attach evidence later with an authorized audited command.

Replay on explicit Sync, connectivity recovery and app resume; use Background Sync only opportunistically. Retain a client operation until the server acknowledges its durable result. A retry reuses its key; an edited operation gets a new key after conflict resolution. Handle each batch item independently.

## Next.js screen slice

Start from a generated API contract and role-specific user story. Server rendering may supply the authenticated shell and initial data, but map, GPS capture and offline queue functionality live in isolated client components. Authorization remains in FastAPI. Use shared status/age/confidence components. Every map information path needs an accessible list/detail alternative.

Implement loading, empty, error, forbidden, offline, stale and conflict states. Verify small-screen controls and keyboard/focus behavior. Do not save bearer tokens in localStorage. Do not cache private API responses with a broad cache-first service worker.

## Provider integration

Build an adapter around authentic samples, not guessed payloads. Normalize source identity, observed/issued/valid times, spatial resolution, units, expiry, license and ingest status. Retain a hash and restricted raw sample where permitted. Retry transient errors with backoff/jitter; stop on permanent authorization errors. Quarantine invalid data and make feed degradation visible.

## Testing ladder

Use pure unit tests for rules and transitions; PostgreSQL/PostGIS integration tests for queries, RLS and transactions; adapter contract tests from licensed redacted samples; OpenAPI/client compatibility checks; browser tests for role journeys and offline recovery; and scenario replay for the incident-to-impact chain. Load testing and restore drills gate pilot use, not merely release aesthetics.

## Research and ML discipline

Write a prediction target, horizon, label and operating cost before a model. Record feature availability time. Compare to simple baselines. Evaluate temporal/geographic holdouts, calibration and missing-data behavior. A rule-based risk label is not a probability. Never use an LLM to invent missing road status, vehicle constraints or official warnings.
