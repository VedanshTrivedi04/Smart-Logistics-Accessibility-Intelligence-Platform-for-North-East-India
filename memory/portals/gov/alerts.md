# Gov / Actionable Alerts Command

- **Route:** /gov/alerts
- **Source:** frontend/src/app/(protected)/gov/alerts/page.tsx
- **Roles / capabilities:** Any government role.
- **Status:** done
- **Last updated:** 2026-09-25

## Purpose
Actionable operational alert command center displaying urgent warnings for facility isolation, projected delivery SLA breaches, and road obstructions.

## Key components / features
- `ActionableAlertsCenter` (`features/alerts/ActionableAlertsCenter.tsx`):
  - Filters: All, Critical (🔴), High (🟠), Road, Logistics, Facility, SLA.
  - Direct Action CTAs on cards: `[View Impact]`, `[View Deliveries]`, `[View Route]`, `[View Fleet]`.
  - 6-Step Alert Detail Inspector:
    1. Alert severity & context
    2. Why generated? (trigger mechanism)
    3. What is affected? (inpatient beds, life-saving consignments, freight convoys)
    4. Recommended action (commander protocol / directives)
    5. Related incident
    6. Related trip/facility
  - Acknowledge toggle and direct execution links.
  - `useScopeFilter` for State Authority alert triage desk and corridor alerts.

## Data & API
- Derived client-side from verified incidents, telemetry feeds, road network impacts, and delivery SLA status.

## Behaviour notes
Focuses strictly on actionable emergency signals requiring commander decisions rather than generic telemetry noise.
- **State Authority:** When viewed by a State Authority (e.g. Bhaskar Singh), displays an authoritative state emergency desk banner, features prioritized state emergency alerts (e.g. Kopili River flash flood breach on NH-27), scopes triage counters to the state, and includes a toggle to inspect regional alerts.
- **District Officer:** When viewed by a District Verifier (e.g. Chitralekha Devi), displays an emerald district emergency desk banner, focusing strictly on high-priority actionable warnings affecting Kamrup Metropolitan circle routes, Guwahati medical hubs, and Sonapur corridor choke points.

## Tests
No page-specific test.

## Known issues / TODO
- None recorded.
