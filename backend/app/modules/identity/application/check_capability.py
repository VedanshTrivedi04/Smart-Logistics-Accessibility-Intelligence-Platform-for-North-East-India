"""
app/modules/identity/application/check_capability.py — CheckCapabilityUseCase.

Fix 5: CapabilityCheckRequest with resource_kind and all 6 layers of authorization.
Returns (allowed: bool, reason: str) — never raises.
enforce_capability raises according to Policy 4 (404 vs 403).
"""

from __future__ import annotations

from dataclasses import dataclass
from uuid import UUID

from app.core.exceptions import ForbiddenError, NotFoundError
from app.modules.identity.domain.enums import Capability, ResourceKind
from app.modules.identity.domain.principal import PrincipalContext


@dataclass(frozen=True)
class CapabilityCheckRequest:
    """All context needed to make a single authorization decision."""
    principal: PrincipalContext
    required_capability: Capability
    resource_org_id: UUID | None = None        # None = own-org resource
    resource_kind: ResourceKind | None = None  # REPORT|FLEET|DELIVERY|ROAD_STATUS|MEDIA
    resource_id: UUID | None = None            # Optional: for assignment-based checks
    jurisdiction_id: UUID | None = None        # Optional: for jurisdiction-scoped checks


class CheckCapabilityUseCase:
    """
    Single authorization decision engine enforcing the 6-layer security model:
    1. Role baseline capability check
    2. Explicit capability grants
    3. Jurisdiction boundary enforcement
    4. Resource organization ownership / tenancy
    5. Cross-organization sharing grants
    6. Resource-level assignments (Phase 5 contract stub)
    """

    def execute(self, req: CapabilityCheckRequest) -> tuple[bool, str]:
        # Layer 1 & 2: Capability check (principal's set aggregates role + active grants)
        if not req.principal.can(req.required_capability):
            return False, "capability_not_granted"

        # Layer 3: Jurisdiction boundary check (if jurisdiction specified)
        if req.jurisdiction_id is not None:
            if not req.principal.has_jurisdiction(req.jurisdiction_id):
                return False, "jurisdiction_not_granted"

        # Layer 4 & 5: Tenancy and Cross-org sharing check
        if req.resource_org_id is not None:
            if req.resource_org_id == req.principal.org_id:
                pass  # Own-org resource: allowed
            elif req.resource_kind is not None and req.principal.has_sharing_grant(
                owner_org_id=req.resource_org_id,
                resource_kind=req.resource_kind,
            ):
                pass  # Active sharing grant covers this resource: allowed
            else:
                return False, "no_sharing_grant_for_cross_org_resource"

        # Layer 6: Assignment check
        if req.resource_id is not None:
            if not self._check_assignment(req):
                return False, "not_assigned_to_resource"

        return True, "allowed"

    def _check_assignment(self, req: CapabilityCheckRequest) -> bool:
        """
        Phase 2: Evaluates AssignmentContext contract (defaults to True when unassigned).
        Phase 5 will enforce strict trip/vehicle/area assignment rules.
        """
        if req.resource_kind == ResourceKind.FLEET and req.resource_id:
            return req.principal.assignment.is_assigned_to_vehicle(req.resource_id)
        if req.resource_kind == ResourceKind.DELIVERY and req.resource_id:
            return req.principal.assignment.is_assigned_to_trip(req.resource_id)
        return True


def enforce_capability(
    req: CapabilityCheckRequest,
    checker: CheckCapabilityUseCase | None = None,
) -> None:
    """
    Evaluate capability check and raise the appropriate HTTP error if denied.
    Enforces Policy 4 (404 vs 403):
    - Lack of visibility (cross-org without sharing grant, jurisdiction, or assignment) -> 404 NOT FOUND
    - Resource visible but action forbidden -> 403 FORBIDDEN
    """
    if checker is None:
        checker = CheckCapabilityUseCase()

    allowed, reason = checker.execute(req)
    if allowed:
        return

    if reason in (
        "jurisdiction_not_granted",
        "no_sharing_grant_for_cross_org_resource",
        "not_assigned_to_resource",
    ):
        raise NotFoundError("Resource not found")

    raise ForbiddenError(f"Action not permitted: {reason}")
