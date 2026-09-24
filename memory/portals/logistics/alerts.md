# Logistics / Alerts

- **Route:** /logistics/alerts
- **Source:** frontend/src/app/(protected)/logistics/alerts/page.tsx
- **Roles / capabilities:** Logistics surface: FLEET_MANAGER, DELIVERY_COORDINATOR, TRANSPORT_OPERATOR. Guard `VIEW_FLEET`. Baseline roles holding it: REGIONAL_AUTHORITY, EMERGENCY_COORDINATOR, FLEET_MANAGER, DELIVERY_COORDINATOR.
- **Status:** done
- **Last updated:** 2026-09-24

## Purpose
Notices for own vehicles, trips and consignments.

## Key components / features
- `LogisticsAlerts`, `useLogisticsNotices`.

## Data & API
- derived client-side

## Behaviour notes
None beyond the above.

## Tests
No page-specific test.

## Known issues / TODO
- None recorded.
