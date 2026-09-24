# Shared / Account and scope

- **Route:** /account
- **Source:** frontend/src/app/(protected)/account/page.tsx
- **Roles / capabilities:** Any signed-in user.
- **Status:** done
- **Last updated:** 2026-09-24

## Purpose
Identity, what the role allows, language/display prefs, data on this device (delete unsent work), sessions.

## Key components / features
- `features/session/AccountView.tsx`.

## Data & API
- GET /api/v1/me; POST /auth/session/logout, /logout-all

## Behaviour notes
Shows an offline-cached identity warning; dev sessions are flagged.

## Tests
No page-specific test.

## Known issues / TODO
- None recorded.
