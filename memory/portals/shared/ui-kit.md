# Shared / UI kit

- **Last updated:** 2026-09-24

- **Source:** frontend/src/shared/ui/*, shared/i18n/*, shared/lib/{format,time,useNow,preferences}.ts
- **Status:** done

- Primitives: Card, Banner (tones ok/info/warn/caution/danger/neutral), Button, Stat, Tabs, Bars, Field, PageHeader, StatusBadge, DataState/QueryState, ErrorNotice, CoverageBanner (states how many records were loaded and if truncated).
- `status.ts` maps statuses to tones/labels (modified 2026-09-24).
- `time.ts` exports `clock.now()` (used by AnalyticsView, mockable); `useNow(ms)` for staleness ticking; `format.ts` has `humanize`, `toCsv`, `downloadText`.
- i18n: `notices.ts` holds notice text; user language/display prefs in `preferences.ts` (UI at /account).
