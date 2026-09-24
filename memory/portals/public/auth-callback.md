# Public / OIDC callback

- **Route:** /auth/callback
- **Source:** frontend/src/app/auth/callback/page.tsx
- **Roles / capabilities:** Anyone completing OIDC.
- **Status:** done
- **Last updated:** 2026-09-24

## Purpose
Completes the OIDC redirect and lets multi-org users choose which organization to work as.

## Key components / features
- `features/session/AuthCallback.tsx`

## Data & API
- GET /api/v1/auth/oidc/callback
- POST /api/v1/auth/select-org

## Behaviour notes
Wrapped in Suspense (uses search params). Redirects via `landingFor`.

## Tests
No page-specific test.

## Known issues / TODO
- None recorded.
