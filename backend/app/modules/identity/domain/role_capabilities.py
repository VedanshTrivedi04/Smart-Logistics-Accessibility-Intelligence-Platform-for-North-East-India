"""
app/modules/identity/domain/role_capabilities.py — Canonical Role-to-Capabilities Mapping.

Source of truth:
- systemdesign.md Lines 18–36
- phase2_plan.md v2.0 (Fix 14: report granularity & default boundaries)

Key Security Guarantees:
- LOCAL_AUTHORITY does NOT have VERIFY_REPORT by default (test #23)
- PLATFORM_ADMINISTRATOR does NOT have VIEW_REPORT_MEDIA by default (test #24)
"""

from __future__ import annotations

from app.modules.identity.domain.enums import Capability, Role

ROLE_CAPABILITY_MAP: dict[Role, frozenset[Capability]] = {
    Role.REGIONAL_AUTHORITY: frozenset({
        Capability.VIEW_REPORT_SUMMARY,
        Capability.VIEW_ROAD_STATUS,
        Capability.VIEW_IMPACT,
        Capability.VIEW_REGION,
        Capability.EXPORT_DATA,
        Capability.COORDINATE_RESPONSE,
        Capability.VIEW_FLEET,
    }),

    Role.STATE_AUTHORITY: frozenset({
        Capability.VIEW_REPORT_SUMMARY,
        Capability.VIEW_REPORT_DETAIL,
        Capability.VIEW_ROAD_STATUS,
        Capability.UPDATE_ROAD_STATUS,
        Capability.VIEW_IMPACT,
        Capability.VIEW_REGION,
        Capability.OVERRIDE_VERIFICATION,
        Capability.EXPORT_DATA,
        Capability.COORDINATE_RESPONSE,
    }),

    Role.DISTRICT_VERIFIER: frozenset({
        Capability.VIEW_REPORT_SUMMARY,
        Capability.VIEW_REPORT_DETAIL,
        Capability.VIEW_REPORT_MEDIA,
        Capability.VERIFY_REPORT,
        Capability.VIEW_ROAD_STATUS,
        Capability.UPDATE_ROAD_STATUS,
    }),

    Role.EMERGENCY_COORDINATOR: frozenset({
        Capability.VIEW_REPORT_SUMMARY,
        Capability.VIEW_REPORT_DETAIL,
        Capability.VIEW_REPORT_MEDIA,
        Capability.RESPOND_EMERGENCY,
        Capability.COORDINATE_RESPONSE,
        Capability.VIEW_ROAD_STATUS,
        Capability.UPDATE_ROAD_STATUS,
        Capability.VIEW_FLEET,
        Capability.VIEW_IMPACT,
    }),

    Role.FIELD_OFFICER: frozenset({
        Capability.SUBMIT_REPORT,
        Capability.VIEW_REPORT_SUMMARY,
        Capability.VIEW_ROAD_STATUS,
    }),

    Role.LOCAL_AUTHORITY: frozenset({
        Capability.SUBMIT_REPORT,
        Capability.VIEW_REPORT_SUMMARY,
        Capability.VIEW_ROAD_STATUS,
        # Intentionally does NOT have VERIFY_REPORT
    }),

    Role.ROAD_INSPECTION: frozenset({
        Capability.SUBMIT_REPORT,
        Capability.VIEW_REPORT_SUMMARY,
        Capability.VIEW_REPORT_DETAIL,
        Capability.VIEW_ROAD_STATUS,
        Capability.UPDATE_ROAD_STATUS,
    }),

    Role.FLEET_MANAGER: frozenset({
        Capability.VIEW_FLEET,
        Capability.COMPUTE_ROUTE,
        Capability.DISPATCH_ROUTE,
        Capability.VIEW_ROAD_STATUS,
        Capability.VIEW_IMPACT,
        Capability.VIEW_DRIVER_PII,
    }),

    Role.DELIVERY_COORDINATOR: frozenset({
        Capability.VIEW_FLEET,
        Capability.COMPUTE_ROUTE,
        Capability.VIEW_ROAD_STATUS,
        Capability.VIEW_DRIVER_PII,
    }),

    Role.TRANSPORT_OPERATOR: frozenset({
        Capability.SUBMIT_GPS,
        Capability.VIEW_ROAD_STATUS,
    }),

    Role.PLATFORM_ADMINISTRATOR: frozenset({
        Capability.VIEW_REPORT_SUMMARY,
        Capability.VIEW_REPORT_DETAIL,
        Capability.MANAGE_IDENTITY,
        Capability.MANAGE_GRANTS,
        Capability.VIEW_ROAD_STATUS,
        Capability.UPDATE_ROAD_STATUS,
        Capability.VIEW_REGION,
        Capability.EXPORT_DATA,
        Capability.VIEW_DRIVER_PII,
        # Intentionally does NOT have VIEW_REPORT_MEDIA by default
    }),
}


def get_role_baseline_capabilities(role: Role) -> frozenset[Capability]:
    """Return the baseline immutable set of capabilities granted to a role."""
    return ROLE_CAPABILITY_MAP.get(role, frozenset())
