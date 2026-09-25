# Field / Home

- **Route:** /field
- **Source:** frontend/src/app/(protected)/field/page.tsx, `frontend/src/features/field/FieldHomeMobile.tsx`
- **Roles / capabilities:** Field surface: FIELD_OFFICER, LOCAL_AUTHORITY, ROAD_INSPECTION. Gated by `SUBMIT_REPORT` & `VIEW_ROAD_STATUS`.
- **Status:** done
- **Last updated:** 2026-09-25

## Purpose
Mobile-first, action-first operational command screen for Senior Field Officer (Elangbam Meitei) answering the 5-second question: *"Where am I + what is happening in my corridor + what action do I take right now?"*

## Key components / features
- `features/field/FieldHomeMobile.tsx`: Rugged mobile container (`max-w-[480px]`) with tactical status bar, time-of-day greeting, and quick action cards.
- `shared/lib/corridors.ts`: High-precision highway projection engine (`snapToCorridor`) snapping GPS fixes to NH-27/NH-6 chainage (e.g. `NH-6 · KM 12.4`), nearest authentic landmark, and off-corridor alerts.
- `features/field/useFieldScope.ts`: Detects field officer identity, assigned lifeline corridor (NH-27/NH-6); patrol unit is null until the identity payload provides it.
- `features/field/useFieldHomeData.ts`: hook consolidating server reports, IndexedDB outbox, corridor health pulse, active drafts, sensor diagnostics, and hazard notices from `useRiskZones`.
- **Top 5 Addons**:
  1. Mountain Canyon Milestone Selector (`CORRIDOR_MILESTONES` modal fallback when GPS drops under deep rock cuts).
  2. Hazard caution strip, shown only when a HIGH/SEVERE risk zone (hazard module) overlaps the corridor; hidden otherwise. No fallback text.
  3. Pre-flight Sensor & Storage Health indicator (`🛰️ GPS accuracy`, `📷 Camera`, `💾 IDB % free`, or 'storage size unknown' when the browser cannot estimate).
  4. 4 Quick Hazard Shortcut chips (`[⛰️ Landslide]`, `[🌊 Flash Flood]`, `[🌉 Bridge]`, `[🚧 Blockage]` pre-filling Step 1).
  5. Latest Report Triage feedback card & Unfinished draft auto-resume banner.

## Data & API
- GET /api/v1/reports (`useReports`)
- GET /api/v1/incidents (`useIncidents("ACTIVE")`)
- GET /api/v1/network/edges (`useEdges(corridorBBox)`)
- GET /api/v1/hazard/risk-zones (`useRiskZones(corridorBBox)`)
- IndexedDB offline queue & drafts via `useOffline()`
- Geolocation telemetry via `useGeolocation`

## Behaviour notes
- Responsive Across All Devices: On desktop screens ($\ge 990\text{px}$), renders a balanced 2-column command center (Action & Location Desk on the left, Situational Intelligence & Progress Bar on the right); on mobile screens ($< 990\text{px}$), smoothly collapses to a single-column thumb-friendly interface.
- Single-thumb ergonomics on mobile with $\ge 52\text{px}$ touch targets.
- Distance formatting via `formatDistance` cleanly formats meters and kilometers (e.g. `1,646.1 km`).
- Works 100% offline; counts and chainage calculate locally from bundle geometry without network roundtrips.
- Control Room SOS link uses `NEXT_PUBLIC_FIELD_SOS_NUMBER`; the button is hidden when unset (no guessed number).
- Incidents have no coordinates, so alerts are scoped to the corridor through the primary report's location (`snapToCorridor`). Reports outside 1.5 km of the corridor are excluded from notices.

## Tests
- `frontend/tests/unit/corridors.test.ts` (snapToCorridor, milestones, off-corridor bounds).

## Known issues / TODO
- Field officer detection is by role/name (interim, same as `useScopeFilter`); should come from backend assignment.
- Only corridor snapping is unit-tested; the mobile UI has not been checked in a browser at 390px.
- Set `NEXT_PUBLIC_FIELD_SOS_NUMBER` per deployment.

