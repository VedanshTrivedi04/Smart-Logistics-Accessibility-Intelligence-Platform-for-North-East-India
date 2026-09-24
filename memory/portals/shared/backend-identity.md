# Shared / Backend: identity

- **Last updated:** 2026-09-24

- **Source:** backend/app/modules/identity/, migration 002
- **Status:** done

- Roles (11), capabilities, `ROLE_CAPABILITY_MAP` (see [[shared/nav-and-auth]]). `Capability` enum includes COORDINATE_RESPONSE (new). `ResourceKind`, `MembershipStatus` (ACTIVE/SUSPENDED/EXPIRED/REVOKED), `JurisdictionLevel` (REGION, state, district).
- Endpoints (/api/v1): GET auth/oidc/init, auth/oidc/callback, auth/csrf-token, me; POST auth/select-org, auth/session/logout, auth/session/logout-all, auth/dev-session, seed-demo.
- Security guarantees: LOCAL_AUTHORITY cannot verify reports; PLATFORM_ADMINISTRATOR has no media access by default.
- Tests: `backend/tests/unit/identity/test_role_capabilities.py`.
