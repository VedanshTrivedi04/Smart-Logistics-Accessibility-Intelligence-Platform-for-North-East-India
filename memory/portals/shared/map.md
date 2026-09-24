# Shared / Map layer

- **Last updated:** 2026-09-24

- **Source:** frontend/src/shared/map/{MapView,MapViewLazy,MapLegend,cluster}.ts(x), shared/lib/geo.ts
- **Status:** done

- MapLibre GL wrapper (`MapView`, lazily loaded via `MapViewLazy`). Supports lines (`MapLine` with class e.g. route_primary, trail), points/markers (kinds stop, self, ...), bounds fitting and a `fitKey`.
- `geo.ts`: `NER_BBOX`, `NER_STATES`, `bearing`, `bboxOfCoordinates`. `bearing` and `NER_STATES` were added 2026-09-24 because the repo did not typecheck without them.
- `MapView.tsx` has an uncommitted diff from outside tracked sessions.
