# Inspector / Official Profile & Scope

- **Route:** /inspector/profile
- **Source:** frontend/src/app/(protected)/inspector/profile/page.tsx
- **Roles / capabilities:** ROAD_INSPECTION
- **Status:** done
- **Last updated:** 2026-09-27

## Purpose
Inspector profile and engineering terminal displaying official credentials, authorized jurisdiction, designated highway corridor scope (NH-6 / NH-27), device hardware telemetry (GPS accuracy, ellipsoidal altitude fix), offline storage quota, and persistent storage authorization.

## Key components / features
- `features/inspection/InspectorProfileView.tsx` - Identity card, corridor scope badge, hardware GPS telemetry readout, and offline storage readiness controller.

## Data & API
- Session principal (`useSession()`).
- Device storage & geolocation APIs.

## Behaviour notes
- Includes quick offline simulation toggle to test field-readiness before entering network-dead zones.

## Tests
- Frontend build validation.

## Known issues / TODO
- None.
