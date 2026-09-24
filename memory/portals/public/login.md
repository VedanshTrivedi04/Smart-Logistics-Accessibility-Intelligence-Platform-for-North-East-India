# Public / Sign in

- **Route:** /login
- **Source:** frontend/src/app/login/page.tsx
- **Roles / capabilities:** Anyone.
- **Status:** done
- **Last updated:** 2026-09-24

## Purpose
Sign-in: OIDC single sign-on plus developer credentials / demo personas for the three orgs.

## Key components / features
- `features/session/LoginView.tsx` (585 lines): `DEMO_PERSONAS`, org IDs ORG_GOV/FIELD/LOGISTICS, `safeNext`, `landingFor` (role -> surface home), `useCompleteLogin`.
- `PersonaSwitcher.tsx`.

## Data & API
- GET /api/v1/auth/oidc/init
- POST /api/v1/auth/dev-session (dev only)
- POST /api/v1/auth/select-org

## Behaviour notes
HttpOnly cookie session; no token reaches JS. `next` param is sanitized by `safeNext`. Shows a 'Your session ended' banner after expiry.

## Tests
`tests/unit/ui.test.tsx`, e2e `access-isolation.spec.ts`.

## Known issues / TODO
- None recorded.
