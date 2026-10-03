# Shared / Map layer

- **Last updated:** 2026-09-24

- **Source:** frontend/src/shared/map/{MapView,MapViewLazy,MapLegend,cluster}.ts(x), shared/lib/geo.ts
- **Status:** done

- MapLibre GL wrapper (`MapView`, lazily loaded via `MapViewLazy`). Supports lines (`MapLine` with class e.g. route_primary, trail, route_feasible_a, route_feasible_b), points/markers (kinds stop, self, ...), bounds fitting and a `fitKey`.
- `geo.ts`: `NER_BBOX`, `NER_STATES`, `bearing`, `bboxOfCoordinates`. `bearing` and `NER_STATES` were added 2026-09-24 because the repo did not typecheck without them.
- `MapView.tsx`: Hardened with `isDisposed` guard and `try-catch` blocks around `map.remove()`, `popup.remove()`, and marker removals to prevent WebGL teardown hangs and unmount race conditions during page navigation.
- **Road & Routing Alignment:** Open roads are cleanly rendered by the underlying Google Satellite/Hybrid tiles; network and route lines (e.g. NH-6, NH-27, NH-15, Kolia Bhomora and Saraighat bridges) adhere strictly to verified physical road pavements, eliminating crude diagonal chords across rivers and mountain terrain. In `AccessibilityExplorer`, road overlays default to `attention` (disrupted/blocked/restricted only).

