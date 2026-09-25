# Gov / Operations Analytics & Reports

- **Route:** /gov/analytics
- **Source:** frontend/src/app/(protected)/gov/analytics/page.tsx
- **Roles / capabilities:** Nav: `VIEW_REPORT_SUMMARY` or `VIEW_FLEET`.
- **Status:** done
- **Last updated:** 2026-09-25

## Purpose
Historical and analytical retrospective command center answering: "Past mein kya hua aur operational performance kaisi rahi?".

## Key components / features
- `AnalyticsCommandCenter` (`features/analytics/AnalyticsCommandCenter.tsx`):
  - Section 1 — Incident Trends: Monthly progression bars (Jan–Jun) and hazard classification breakdown.
  - Section 2 — Road Disruptions: Blocked (18), Restricted (34), Resolved (62), Average resolution time (4.2h).
  - Section 3 — Logistics Performance: Total trips (128), Delayed trips (24), Critical SLA breaches (6), Average delay (38 mins).
  - Section 4 — State-wise Operational Table: 8 Northeast States (Assam, Meghalaya, Manipur, Arunachal, Nagaland, Mizoram, Tripura, Sikkim) with incidents, trips, delays, clearance times, and vulnerability tiers.
  - Section 5 — Export: [Generate Report] interactive modal briefing, [Export CSV] dataset download, [Export PDF] printable report.
  - `useScopeFilter` for State Authority analytical intelligence desk and jurisdiction highlights.

## Data & API
- Historical incident records, road clearance times, and completed trip delivery SLAs.

## Behaviour notes
Focuses purely on historical and retrospective trends rather than live vehicle GPS tracking.
- **State Authority:** For State Authority users (e.g. Bhaskar Singh), displays an authoritative state analytics banner and highlights the assigned state (Assam) row in Section 4 with a distinctive `★ YOUR JURISDICTION` badge, while allowing review across comparative regional state benchmarks.
- **District Officer:** For District Verifiers (e.g. Chitralekha Devi), displays an emerald district analytics banner and dynamically adapts Section 4 into the **District Administrative Circles & Sub-Divisions Operational Breakdown** featuring all 6 circles of Kamrup Metropolitan (Guwahati Urban, Dispur Capital, Azara Airport, Sonapur Frontier, North Guwahati Saraighat, Chandrapur Riverine) with localized incident recurrence, trips, delays, clearance velocity, and vulnerability tiers. Export features generate district-specific CSV/briefings.

## Tests
`domain-logic.test.ts`.

## Known issues / TODO
- None recorded.
