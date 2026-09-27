# Shared / API client and types

- **Last updated:** 2026-09-28

- **Source:** frontend/src/shared/api/{client,csrf,errors,index}.ts, schema.d.ts (generated), types.ts
- **Status:** done

- `openapi-fetch` client typed from `backend/openapi.json`. Regenerate with `pnpm gen:api` (runs `openapi-typescript ../backend/openapi.json -o src/shared/api/schema.d.ts`) after any backend route or schema change, then update the pages that use it.
- `errors.ts` normalizes API errors for `ErrorNotice`. `csrf.ts` attaches the CSRF header for mutating calls.
- `client.ts` `onResponse` middleware dispatches `SESSION_EXPIRED_EVENT` on 401 responses ONLY for protected endpoints. It specifically excludes `/api/v1/me` and `/api/v1/auth/*` to prevent infinite refetch loops when the client is unauthenticated.
- Requests go through the Next.js proxy; the browser never holds a token.
- `types.ts` re-exports schema types (Capability, Incident, Report, Trip, Vehicle, ...). Note: the API `Incident` has no lat/lon and vehicles have no plate_number/speed_kmh (source of the AccessibilityExplorer type errors).
