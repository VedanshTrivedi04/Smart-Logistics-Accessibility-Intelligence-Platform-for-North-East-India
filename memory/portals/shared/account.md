# Shared / Account & Access Scope

- **Route:** /account
- **Source:** frontend/src/app/(protected)/account/page.tsx
- **Roles / capabilities:** Any signed-in user.
- **Status:** done
- **Last updated:** 2026-09-27

## Purpose
Authoritative identity profile, 8-state Northeast jurisdictional access scope, fleet operational mandate, and security session management.

## Key components / features
- `features/session/AccountView.tsx`:
  - My Profile: Dynamic role detection for Regional Authority (MDoNER Regional Commander), State Authority (Bhaskar Singh / Assam State Department of Transport), District Verifier (Chitralekha Devi / Kamrup Metropolitan District Administration), Senior Road Inspector (Girish Nongmeikapam / Road Inspection Intelligence), Field Officer (Elangbam Meitei / North East Strategic Lifelines Division), Fleet Operations Manager (Hema Goswami / Regional Fleet Operations), Delivery Coordinator (Indraneil Bhattacharya / Multimodal Consignment Logistics), and Transport Operator (Jayashree Teron / Heavy Commercial Transport).
  - Field Operations & Inspector Banners: Operational status for field patrol officers and engineering inspectors covering NH-6 / NH-27 lifeline corridors.
  - Fleet Operations Banners: Dedicated operational status banners for Fleet Operations (`FLEET_MANAGER`), Consignment Logistics (`DELIVERY_COORDINATOR`), and Transport Operator (`TRANSPORT_OPERATOR`) with direct action link to the Driver Cockpit (`/logistics/operator`).
  - Access Scope & Capabilities:
    - State Authority: Displays 1 of 8 states active as `PRIMARY STATE JURISDICTION` (Assam) with adjacent states marked as `Adjacent Telemetry Only`.
    - District Officer: Displays an emerald District Authority banner, an **Administrative Circles & Sub-Divisions Checklist** with all 6 circles of Kamrup Metropolitan active (`PRIMARY CIRCLE`), parent state marked as `PARENT STATE`, and other states marked as `Adjacent`.
    - Road Inspector: Shows granted capabilities (`CONDUCT_INSPECTION`, `VERIFY_REPORT`, `UPDATE_ROAD_STATUS`, `VIEW_ROAD_STATUS`) scoped by assigned missions.
    - Field Officer: Shows active granted capabilities with checkmarks (`SUBMIT_REPORT`, `VIEW_REPORT_SUMMARY`, `VIEW_ROAD_STATUS`, etc.) and explicit server-enforced restricted capabilities (`UPDATE_ROAD_STATUS`, `VERIFY_REPORT`, `MANAGE_FLEET`, `REGIONAL_ANALYTICS`) with security governance rationales.
    - Fleet Operations Roles: Displays active granted capabilities (`VIEW_FLEET`, `DISPATCH_ROUTE`, `COORDINATE_RESPONSE`, `VIEW_IMPACT`, `SUBMIT_GPS`) reflecting the unified fleet and multimodal transport hierarchy.
  - Security & Sessions: Last login timestamp, active sessions list (Web Portal + Android Field Terminal), [Logout All Sessions] and [Sign Out] actions.

## Data & API
- GET /api/v1/me; POST /auth/session/logout, /logout-all

## Behaviour notes
Clean, simple government credentials overview with multi-session revocation support and dynamic role-appropriate jurisdictional scoping (Regional, State, District, Field Officer, and Fleet Operations hierarchy).

## Tests
No page-specific test.

## Known issues / TODO
- None recorded.
