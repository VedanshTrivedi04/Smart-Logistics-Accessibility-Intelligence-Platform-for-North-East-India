"""
app/modules/identity/domain/enums.py — Core domain enums for Identity, Auth & RBAC.

Defined in alignment with:
- systemdesign.md (Lines 18–36, 119)
- phase2_plan.md v2.0
"""

from __future__ import annotations

from enum import Enum


class Role(str, Enum):
    """
    11 canonical system roles across Government, Field, Logistics, and Admin tiers.
    Source: systemdesign.md Lines 18–36.
    """
    # Government tier
    REGIONAL_AUTHORITY = "REGIONAL_AUTHORITY"
    STATE_AUTHORITY = "STATE_AUTHORITY"
    DISTRICT_VERIFIER = "DISTRICT_VERIFIER"
    EMERGENCY_COORDINATOR = "EMERGENCY_COORDINATOR"

    # Field tier
    FIELD_OFFICER = "FIELD_OFFICER"
    LOCAL_AUTHORITY = "LOCAL_AUTHORITY"
    ROAD_INSPECTION = "ROAD_INSPECTION"

    # Logistics tier
    FLEET_MANAGER = "FLEET_MANAGER"
    DELIVERY_COORDINATOR = "DELIVERY_COORDINATOR"
    TRANSPORT_OPERATOR = "TRANSPORT_OPERATOR"

    # Admin tier
    PLATFORM_ADMINISTRATOR = "PLATFORM_ADMINISTRATOR"


class Capability(str, Enum):
    """
    Fine-grained system capabilities checked across all operational modules.
    Includes granular report capabilities (Fix 14).
    """
    # Report capabilities
    VIEW_REPORT_SUMMARY = "VIEW_REPORT_SUMMARY"
    VIEW_REPORT_DETAIL = "VIEW_REPORT_DETAIL"
    VIEW_REPORT_MEDIA = "VIEW_REPORT_MEDIA"
    SUBMIT_REPORT = "SUBMIT_REPORT"
    VERIFY_REPORT = "VERIFY_REPORT"
    OVERRIDE_VERIFICATION = "OVERRIDE_VERIFICATION"

    # Road network & GIS
    VIEW_ROAD_STATUS = "VIEW_ROAD_STATUS"
    UPDATE_ROAD_STATUS = "UPDATE_ROAD_STATUS"
    VIEW_REGION = "VIEW_REGION"

    # Logistics & routing
    COMPUTE_ROUTE = "COMPUTE_ROUTE"
    DISPATCH_ROUTE = "DISPATCH_ROUTE"
    SUBMIT_GPS = "SUBMIT_GPS"
    VIEW_FLEET = "VIEW_FLEET"
    VIEW_DRIVER_PII = "VIEW_DRIVER_PII"

    # Analytics & emergency
    VIEW_IMPACT = "VIEW_IMPACT"
    EXPORT_DATA = "EXPORT_DATA"
    RESPOND_EMERGENCY = "RESPOND_EMERGENCY"

    # Administration
    MANAGE_IDENTITY = "MANAGE_IDENTITY"
    MANAGE_GRANTS = "MANAGE_GRANTS"


class ResourceKind(str, Enum):
    """Kinds of domain resources subject to scope & sharing authorization."""
    REPORT = "REPORT"
    FLEET = "FLEET"
    DELIVERY = "DELIVERY"
    ROAD_STATUS = "ROAD_STATUS"
    MEDIA = "MEDIA"
    GRANT = "GRANT"
    IDENTITY = "IDENTITY"
    JURISDICTION = "JURISDICTION"


class MembershipStatus(str, Enum):
    """
    Explicit membership lifecycle states (Fix 8).
    Replaces loose boolean flags.
    """
    ACTIVE = "ACTIVE"
    SUSPENDED = "SUSPENDED"
    EXPIRED = "EXPIRED"
    REVOKED = "REVOKED"


class JurisdictionLevel(str, Enum):
    """Hierarchy levels for geographic jurisdictions (Fix 9)."""
    REGION = "REGION"
    STATE = "STATE"
    DISTRICT = "DISTRICT"


class OrgKind(str, Enum):
    """Classification of organizations."""
    GOVERNMENT = "GOVERNMENT"
    FIELD_AUTHORITY = "FIELD_AUTHORITY"
    LOGISTICS = "LOGISTICS"
    PUBLIC = "PUBLIC"


class GrantScopeType(str, Enum):
    """Types of explicit administrative grants."""
    CAPABILITY = "CAPABILITY"
    JURISDICTION = "JURISDICTION"
