# Shared / Backend: logistics

- **Last updated:** 2026-09-28

- **Source:** backend/app/modules/logistics/, migrations 005 & 013 (`013_delivery_pod_lifecycle`)
- **Status:** done

- /logistics: POST/GET vehicles, drivers, commitments, trips; GET trips/{id}; POST trips/{id}/transition; GET commitments/{id}; PATCH commitments/{id}/status. Org-scoped.
- Mutating endpoints verify capability and explicitly commit to database.
- Trip-Commitment Lifecycle Architecture:
  - Transition to `IN_TRANSIT`: automatically updates all linked commitments to `IN_TRANSIT` and sets `actual_departure`.
  - Transition to `COMPLETED`: records vehicle arrival (`actual_arrival`), but does NOT blindly mark commitments as `DELIVERED`. Consignments remain in their current state until authoritative handover/POD.
  - Transition to `CANCELLED`/`ABORTED`: releases linked commitments back to `PENDING` while preserving `previous_trip_code`, `previous_trip_status`, `cancellation_reason`, and `released_at` for auditability and reassignment context.
- Authoritative POD & State Transitions:
  - `GET /commitments/{commitment_id}`: Retrieves single consignment commitment with org scoping and POD metadata.
  - `PATCH /commitments/{commitment_id}/status`: Enforces `validate_delivery_state_transition` FSM. Updates delivered units, shortage reason, recipient name, organization, condition (`DeliveryCondition`), and signature acknowledgement.
  - Scoped Driver Authorization: Drivers (`Role.TRANSPORT_OPERATOR`) can only update status for commitments actively assigned to their current mission.
- Dispatch Compatibility Enforcement:
  - Validates vehicle payload capacity vs total consigned weight (`VehicleCapacityExceededError`).
  - Validates hazmat cargo against vehicle hazmat certification (`VehicleHazmatIncapableError`).
  - Validates cold-chain cargo against vehicle refrigeration capability (`VehicleColdChainIncapableError`).
  - Row-level locking and active trip conflict validation (`ResourceAlreadyDispatchedError`).
- Dynamic SLA Engine:
  - Configurable `at_risk_threshold_minutes` (default 120m) with strict UTC normalization.
- Tests: `backend/tests/integration/logistics/test_fleet_dispatch.py` (8 passing integration tests), `backend/tests/unit/logistics/test_logistics_domain.py` (16 passing domain tests).
