"use client";

import { useMemo } from "react";
import { usePrincipal } from "@/shared/auth";
import { formatAge } from "@/shared/lib/time";
import { humanize } from "@/shared/lib/format";
import { snapToCorridor, type CorridorSnapResult } from "@/shared/lib/corridors";
import { buildNotices } from "@/features/alerts";
import { useIncidents, useReports } from "@/features/incidents";
import { useRiskZones } from "@/features/hazard";
import { useEdges } from "@/features/network";
import { useOffline } from "./OfflineProvider";
import { useOfflineSnapshot } from "./useOfflineSnapshot";
import { useFieldScope, type FieldScopeResult } from "./useFieldScope";
import { useGeolocation } from "./useGeolocation";
import { isReportPayload } from "./model";

export interface FieldReportPreview {
  id: string;
  type: string;
  severity: string;
  status: string;
  title: string;
  timeAgo: string;
  isLocal: boolean;
}

export interface FieldDraftPreview {
  id: string;
  type: string;
  title: string;
  step: number;
  timeAgo: string;
}

export interface CorridorHealthSummary {
  blocked: number;
  restricted: number;
  open: number;
  caution: number;
  total: number;
}

export interface SensorHealth {
  gpsStatus: "LOCKED" | "SEARCHING" | "DENIED" | "IDLE";
  gpsAccuracyM: number | null;
  storageReady: boolean;
  /** Null when the browser cannot estimate storage, so the UI never shows an invented figure. */
  storageFreePct: number | null;
}

export interface FieldHomeData {
  scope: FieldScopeResult;
  geo: ReturnType<typeof useGeolocation>;
  snap: CorridorSnapResult | null;
  isOnline: boolean;
  syncing: boolean;
  lastSyncAt: Date | null;
  syncNow: () => Promise<void>;
  pendingCount: number;
  needsAttentionCount: number;
  myReportsCount: number;
  nearbyAlertsCount: number;
  corridorHealth: CorridorHealthSummary;
  latestReport: FieldReportPreview | null;
  activeDraft: FieldDraftPreview | null;
  sensorHealth: SensorHealth;
  weatherNotice: string | null;
  /** Set when some figures come from the copy saved on the device (oldest fetch time). */
  cachedDataAsOf: Date | null;
}

export function useFieldHomeData(): FieldHomeData {
  const me = usePrincipal();
  const scope = useFieldScope();
  const geo = useGeolocation(true);
  const { snapshot, syncNow, syncing, ready, simulatedOffline, lastSyncAt, storage } = useOffline();

  const incidents = useIncidents("ACTIVE");
  const reports = useReports();
  const edges = useEdges(scope.corridorBBox, 13, true);
  const riskZones = useRiskZones(scope.corridorBBox);
  // Last-known copies for when there is no signal.
  const reportsS = useOfflineSnapshot("reports", reports);
  const incidentsS = useOfflineSnapshot("incidents", incidents);
  const edgesS = useOfflineSnapshot("corridor-edges", edges);
  const riskS = useOfflineSnapshot("corridor-risk", riskZones);
  const savedCopies = [reportsS, incidentsS, edgesS, riskS].filter((x) => x.fromDevice && x.asOf);
  const cachedDataAsOf = savedCopies.length ? new Date(Math.min(...savedCopies.map((x) => x.asOf!.getTime()))) : null;

  // 1. Geolocation & Highway Corridor Snapping
  const fix = geo.state.status === "ok" ? geo.state.fix : null;
  const snap = useMemo<CorridorSnapResult | null>(() => {
    if (!fix) return null;
    return snapToCorridor(fix.latitude, fix.longitude);
  }, [fix]);

  // 2. Pending and local operations count
  const pendingOps = useMemo(() => {
    return (snapshot?.operations ?? []).filter((o) => o.state !== "SYNCED");
  }, [snapshot]);

  const needsAttentionCount = useMemo(() => {
    return pendingOps.filter((o) =>
      ["NEEDS_LOGIN", "NEEDS_REVIEW", "FAILED_WITH_REASON"].includes(o.state)
    ).length;
  }, [pendingOps]);

  // 3. Officer's Reports Count (Server verified/submitted + local unsynced)
  const myReportsCount = useMemo(() => {
    const serverMine = (reportsS.data ?? []).filter((r) => r.reporter_id === me.user_id).length;
    const localUnsynced = pendingOps.length;
    return serverMine + localUnsynced;
  }, [reportsS.data, me.user_id, pendingOps]);

  // 4. Corridor-scoped notices and alerts. Incidents carry no coordinates, so they are scoped
  // through their primary report's location.
  const corridorReports = useMemo(
    () => (reportsS.data ?? []).filter((r) => snapToCorridor(r.location.latitude, r.location.longitude).isWithinCorridor),
    [reportsS.data],
  );
  const corridorIncidents = useMemo(() => {
    const ids = new Set(corridorReports.map((r) => r.id));
    return (incidentsS.data ?? []).filter((inc) => ids.has(inc.primary_report_id));
  }, [incidentsS.data, corridorReports]);
  const notices = useMemo(() => {
    return buildNotices({
      incidents: corridorIncidents,
      reports: corridorReports,
      ownUserId: me.user_id,
      hrefs: { report: (id) => `/field/reports/${id}` },
    });
  }, [corridorIncidents, corridorReports, me.user_id]);

  const nearbyAlertsCount = notices.length;

  // 5. Corridor Highway Passability Health
  const corridorHealth = useMemo<CorridorHealthSummary>(() => {
    const feats = edgesS.data?.features ?? [];
    let blocked = 0;
    let restricted = 0;
    let caution = 0;
    let open = 0;

    for (const f of feats) {
      const st = f.props.accessibility_status;
      if (st === "BLOCKED") blocked++;
      else if (st === "RESTRICTED") restricted++;
      else if (st === "PROVISIONAL_CAUTION") caution++;
      else if (st === "OPEN") open++;
    }

    return {
      blocked,
      restricted,
      caution,
      open,
      total: feats.length,
    };
  }, [edgesS.data]);

  // 6. Active Unfinished Draft
  const activeDraft = useMemo<FieldDraftPreview | null>(() => {
    if (!snapshot?.drafts || snapshot.drafts.length === 0) return null;
    const latest = snapshot.drafts[0];
    if (!latest) return null;

    const payload = latest.payload;
    const typeLabel = isReportPayload(payload) ? humanize(payload.reportType) : "Incident Report";
    const title = payload.description ? payload.description.slice(0, 40) : "Draft in progress";

    return {
      id: latest.draft.id,
      type: typeLabel,
      title,
      step: latest.draft.step,
      timeAgo: formatAge(latest.draft.updatedAt, new Date()),
    };
  }, [snapshot?.drafts]);

  // 7. Latest Report status
  const latestReport = useMemo<FieldReportPreview | null>(() => {
    // Check if there is an unsynced local op first
    if (pendingOps.length > 0) {
      const topOp = pendingOps[0];
      if (topOp) {
        return {
          id: topOp.id,
          type: isReportPayload(topOp.payload) ? humanize(topOp.payload.reportType) : "Report",
          severity: isReportPayload(topOp.payload) ? String(topOp.payload.severity) : "UNKNOWN",
          status: topOp.state === "QUEUED" ? "WAITING_TO_SYNC" : topOp.state,
          title: isReportPayload(topOp.payload) && topOp.payload.description ? topOp.payload.description.slice(0, 48) : "Pending Ground Report",
          timeAgo: formatAge(topOp.createdAt, new Date()),
          isLocal: true,
        };
      }
    }

    // Otherwise check server reports
    const myServerReports = (reportsS.data ?? [])
      .filter((r) => r.reporter_id === me.user_id)
      .sort((a, b) => new Date(b.observed_at).getTime() - new Date(a.observed_at).getTime());

    if (myServerReports.length > 0) {
      const r = myServerReports[0]!;
      return {
        id: r.id,
        type: humanize(r.report_type),
        severity: r.severity,
        status: r.review_state,
        title: r.description ? r.description.slice(0, 48) : `${humanize(r.report_type)} near Corridor`,
        timeAgo: formatAge(r.received_at || r.observed_at, new Date()),
        isLocal: false,
      };
    }

    return null;
  }, [pendingOps, reportsS.data, me.user_id]);

  // 8. Device Sensor & Storage Health
  const sensorHealth = useMemo<SensorHealth>(() => {
    const gpsStatus: SensorHealth["gpsStatus"] =
      geo.state.status === "ok"
        ? "LOCKED"
        : geo.state.status === "locating"
        ? "SEARCHING"
        : geo.state.status === "denied" || geo.state.status === "unavailable" || geo.state.status === "timeout"
        ? "DENIED"
        : "IDLE";

    const storageFreePct = storage && storage.supported && storage.quotaBytes > 0
      ? Math.round(((storage.quotaBytes - storage.usageBytes) / storage.quotaBytes) * 100)
      : null;

    return {
      gpsStatus,
      gpsAccuracyM: fix?.accuracy_m ?? null,
      storageReady: ready,
      storageFreePct,
    };
  }, [geo.state, fix, storage, ready]);

  // 9. Rainfall/landslide caution from the hazard module's risk zones over the corridor.
  // Null (strip hidden) when there is no HIGH/SEVERE zone or the data is unavailable.
  const weatherNotice = useMemo<string | null>(() => {
    const zones = (riskS.data?.zones ?? []).filter((z) => z.riskLevel === "HIGH" || z.riskLevel === "SEVERE");
    if (zones.length === 0) return null;
    const worst = zones.some((z) => z.riskLevel === "SEVERE") ? "Severe" : "High";
    const rain = Math.max(0, ...zones.map((z) => z.rainfallMm24h ?? 0));
    return `${worst} hazard risk on ${zones.length} zone${zones.length === 1 ? "" : "s"} along the corridor${rain > 0 ? ` · ${Math.round(rain)} mm rain in 24 h` : ""}`;
  }, [riskS.data]);

  const isOnline = !simulatedOffline && (typeof navigator !== "undefined" ? navigator.onLine : true);

  return {
    scope,
    geo,
    snap,
    isOnline,
    syncing,
    lastSyncAt,
    syncNow,
    pendingCount: pendingOps.length,
    needsAttentionCount,
    myReportsCount,
    nearbyAlertsCount,
    corridorHealth,
    latestReport,
    activeDraft,
    sensorHealth,
    weatherNotice,
    cachedDataAsOf,
  };
}
