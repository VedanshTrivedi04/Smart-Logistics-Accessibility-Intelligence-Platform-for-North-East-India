# Shared / Account & Access Scope

- **Route:** /account
- **Source:** frontend/src/app/(protected)/account/page.tsx
- **Roles / capabilities:** Any signed-in user.
- **Status:** done
- **Last updated:** 2026-09-25

## Purpose
Authoritative identity profile, 8-state Northeast jurisdictional access scope, and security session management.

## Key components / features
- `features/session/AccountView.tsx`:
  - My Profile: Dynamic role detection for Regional Authority (MDoNER Regional Commander), State Authority (Bhaskar Singh / Assam State Department of Transport), District Verifier (Chitralekha Devi / Kamrup Metropolitan District Administration), and Field Officer (Elangbam Meitei / North East Strategic Lifelines Division).
  - Field Operations Banner: Special operational banner for field patrol officers covering NH-6 / NH-27 lifeline corridors.
  - Access Scope:
    - State Authority: Displays 1 of 8 states active as `PRIMARY STATE JURISDICTION` (Assam) with adjacent states marked as `Adjacent Telemetry Only`.
    - District Officer: Displays an emerald District Authority banner, an **Administrative Circles & Sub-Divisions Checklist** with all 6 circles of Kamrup Metropolitan active (`PRIMARY CIRCLE`), parent state marked as `PARENT STATE`, and other states marked as `Adjacent`.
    - Field Officer: Shows active granted capabilities with checkmarks (`SUBMIT_REPORT`, `VIEW_REPORT_SUMMARY`, `VIEW_ROAD_STATUS`, etc.) and explicit server-enforced restricted capabilities (`UPDATE_ROAD_STATUS`, `VERIFY_REPORT`, `MANAGE_FLEET`, `REGIONAL_ANALYTICS`) with security governance rationales.
  - Security & Sessions: Last login timestamp, active sessions list (Web Portal + Android Field Terminal), [Logout All Sessions] and [Sign Out] actions.

## Data & API
- GET /api/v1/me; POST /auth/session/logout, /logout-all

## Behaviour notes
Clean, simple government credentials overview with multi-session revocation support and dynamic role-appropriate jurisdictional scoping (Regional, State, District, and Field Officer hierarchy).

## Tests
No page-specific test.

## Known issues / TODO
- None recorded.
