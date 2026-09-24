# Shared / Features: hazard, impact, alerts, overview, analytics

- **Last updated:** 2026-09-24

- **Source:** frontend/src/features/{hazard,impact,alerts,overview,analytics}/*
- **Status:** done

- hazard: `useRiskZones(bbox)`, `riskZones.ts` (landslide risk levels; HIGH/SEVERE emphasised).
- impact: `useImpactData` combines facility and trip impacts; `ImpactBoard`, `ImpactChain`.
- alerts: notices are computed client-side (`build.ts`, `useGovernmentNotices`, `useLogisticsNotices`); severity CRITICAL/HIGH/...; not persisted.
- overview: `GovOverview`, `LogisticsOverview`, `EmergencyBoard`, `GlobalSearch`, `CommandMap` (wraps AccessibilityExplorer).
- analytics: `AnalyticsView`, `periods.ts` (`resolvePeriod`, previous-period comparison).
