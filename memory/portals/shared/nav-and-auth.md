# Shared / Navigation, session and access gating

- **Last updated:** 2026-09-24

- **Source:** frontend/src/app/nav.ts, app/Guard.tsx, app/SessionGate.tsx, app/SubNav.tsx, shared/auth/{roles,session,providers}.ts(x), shared/ui/AppShell.tsx
- **Status:** done

## Model
- Three surfaces map from role: government (`/gov`), field (`/field`), logistics (`/logistics`). `ROLE_SURFACE` in `shared/auth/roles.ts` mirrors the backend `Role` enum (11 roles). Backend stays authoritative.
- `NAV` in `app/nav.ts` is per-surface and hides items via `requires` (any-of capabilities). Nav is convenience, never the authorization boundary.
- `Guard` (`app/Guard.tsx`) renders `ForbiddenView` if surface or capability (`canAny`) does not fit; server still refuses the data.
- `hasAny(capabilities, required)` = any-of semantics. Pages with two capabilities (e.g. `/gov/regions`: VIEW_REGION or VIEW_IMPACT) pass if either is held.

## Baseline role -> capability map (backend `role_capabilities.py`)
- REGIONAL_AUTHORITY: VIEW_REPORT_SUMMARY, VIEW_ROAD_STATUS, VIEW_IMPACT, VIEW_REGION, EXPORT_DATA, COORDINATE_RESPONSE, VIEW_FLEET
- STATE_AUTHORITY: report summary+detail, road status view/update, VIEW_IMPACT, VIEW_REGION, OVERRIDE_VERIFICATION, EXPORT_DATA, COORDINATE_RESPONSE
- DISTRICT_VERIFIER: report summary/detail/media, VERIFY_REPORT, road status view/update
- EMERGENCY_COORDINATOR: report summary/detail/media, RESPOND_EMERGENCY, COORDINATE_RESPONSE, road status view/update, VIEW_FLEET, VIEW_IMPACT
- FIELD_OFFICER / LOCAL_AUTHORITY: SUBMIT_REPORT, VIEW_REPORT_SUMMARY, VIEW_ROAD_STATUS (LOCAL_AUTHORITY intentionally cannot VERIFY_REPORT)
- ROAD_INSPECTION: SUBMIT_REPORT, report summary/detail, road status view/update
- FLEET_MANAGER: VIEW_FLEET, COMPUTE_ROUTE, DISPATCH_ROUTE, VIEW_ROAD_STATUS, VIEW_IMPACT, VIEW_DRIVER_PII
- DELIVERY_COORDINATOR: VIEW_FLEET, COMPUTE_ROUTE, VIEW_ROAD_STATUS, VIEW_DRIVER_PII
- TRANSPORT_OPERATOR: SUBMIT_GPS, VIEW_ROAD_STATUS
- PLATFORM_ADMINISTRATOR: report summary/detail (NOT media), MANAGE_IDENTITY, MANAGE_GRANTS, road status view/update, VIEW_REGION, EXPORT_DATA, VIEW_DRIVER_PII
- `COORDINATE_RESPONSE` added 2026-09-24 for Regional/State/Emergency roles.

## Session & Jurisdictional Scoping
- HttpOnly cookie, CSRF token via GET /api/v1/auth/csrf-token (`shared/api/csrf.ts`), identity from GET /api/v1/me, cached offline in `shared/offline/identity-cache.ts`.
- `useScopeFilter` (`frontend/src/shared/auth/useScopeFilter.ts`): Scopes operational data, incident triage, live fleet tracking, and GIS map bounding boxes to the assigned state (e.g. Assam `[89.7, 24.1, 96.0, 28.2]`) when authenticated as a State Authority (e.g. Bhaskar Singh), with user toggles to view the full 8-state Northeast region.

## Navigation Responsiveness & UX
- `shared/ui/NavigationProgress.tsx`: Top responsive animated gradient progress bar intercepting internal link clicks for 0ms visual confirmation. Mounted in `frontend/src/app/layout.tsx`.
- `shared/ui/AppShell.tsx`: Navigation items feature instant pending state (`Loader2` spinner + "Opening…" chip) on click to prevent multi-click abort loops during page compilation. Links use `prefetch={false}` to avoid dev-server CPU thrashing.
- `app/(protected)/loading.tsx` and `app/(protected)/gov/loading.tsx`: Instant skeleton loaders rendered during route transitions.

