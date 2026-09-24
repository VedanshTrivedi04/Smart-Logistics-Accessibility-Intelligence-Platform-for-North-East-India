# Gov / Alerts

- **Route:** /gov/alerts
- **Source:** frontend/src/app/(protected)/gov/alerts/page.tsx
- **Roles / capabilities:** Any government role.
- **Status:** done
- **Last updated:** 2026-09-24

## Purpose
Notices derived from current records (incidents, reports, impacts, fleet), most urgent first. Acknowledge/escalate via coordination.

## Key components / features
- `GovernmentAlerts` (`features/alerts/AlertsFeed.tsx`), `features/coordination/AlertCoordination.tsx`.

## Data & API
- Derived client-side from incidents/impacts/commitments/vehicles; POST /api/v1/coordination/actions

## Behaviour notes
Notices are computed, not stored; `NoticeDisclaimer` explains this.

## Tests
No page-specific test.

## Known issues / TODO
- None recorded.
