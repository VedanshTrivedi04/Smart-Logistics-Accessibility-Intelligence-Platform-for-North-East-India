# Shared / Backend: identity

- **Last updated:** 2026-09-25

- **Source:** backend/app/modules/identity/, migration 002
- **Status:** done

- Roles (11), capabilities, `ROLE_CAPABILITY_MAP` (see [[shared/nav-and-auth]]). `Capability` enum includes COORDINATE_RESPONSE. `ResourceKind`, `MembershipStatus` (ACTIVE/SUSPENDED/EXPIRED/REVOKED), `JurisdictionLevel` (REGION, state, district).
- Role `DISTRICT_VERIFIER` capabilities updated (2026-09-25) to include `VIEW_REGION`, `VIEW_IMPACT`, `VIEW_FLEET`, `COORDINATE_RESPONSE`, and `EXPORT_DATA` so District Officers have full operational oversight across their district jurisdiction.
- Endpoints (/api/v1): GET auth/oidc/init, auth/oidc/callback, auth/csrf-token, me; POST auth/select-org, auth/session/logout, auth/session/logout-all, auth/dev-session, seed-demo.
- Security guarantees: LOCAL_AUTHORITY cannot verify reports; PLATFORM_ADMINISTRATOR has no media access by default.
- Tests: `backend/tests/unit/identity/test_role_capabilities.py`.
