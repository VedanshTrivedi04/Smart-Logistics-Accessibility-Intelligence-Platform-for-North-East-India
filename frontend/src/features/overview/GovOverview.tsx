"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useSession, useScopeFilter } from "@/shared/auth";
import { NER_BBOX } from "@/shared/lib/geo";
import { MapLegend, MapView } from "@/shared/map";
import { downloadText, toCsv } from "@/shared/lib/format";
import { Banner, Button, Card, CoverageBanner, ErrorNotice, PageHeader, Stat } from "@/shared/ui";
import { NoticeList, useGovernmentNotices } from "@/features/alerts";
import { useCommitments, useFleetPositions, useTrips, useVehicles } from "@/features/fleet";
import { useRiskZones } from "@/features/hazard";
import { useImpactData } from "@/features/impact";
import { useIncidents, useReports } from "@/features/incidents";
import { EDGE_LIMIT, edgeLines, summarizeEdges, useEdges, useFacilities } from "@/features/network";
import { GlobalSearch } from "./GlobalSearch";

/** Command overview: every figure is computed from records the server returned for this user's scope. */
export function GovOverview() {
  const { principal, can } = useSession();
  const { isStateAuthority, isDistrictOfficer, assignedState, assignedDistrict, activeBBox } = useScopeFilter();
  const effectiveBBox = activeBBox || NER_BBOX;

  const edges = useEdges(effectiveBBox, 6);
  const facilities = useFacilities();
  const hazard = useRiskZones(effectiveBBox);
  const incidents = useIncidents();
  const reports = useReports(undefined, can("VIEW_REPORT_SUMMARY"));
  const impact = useImpactData();
  const fleetVisible = can("VIEW_FLEET");
  const vehicles = useVehicles(fleetVisible);
  const trips = useTrips(undefined, fleetVisible);
  const commitments = useCommitments(undefined, fleetVisible);
  const positions = useFleetPositions(vehicles.data);
  const { notices, loading: noticesLoading } = useGovernmentNotices();

  const features = useMemo(() => edges.data?.features ?? [], [edges.data]);
  const roads = useMemo(() => summarizeEdges(features), [features]);
  const lines = useMemo(() => edgeLines(features.filter((f) => f.props.accessibility_status !== "OPEN")), [features]);

  const inc = incidents.data ?? [];
  const activeInc = inc.filter((i) => i.lifecycle === "ACTIVE");
  const rep = reports.data ?? [];
  const isolated = new Set(impact.facilityImpacts.filter((f) => f.impact.isolated).map((f) => f.facility.id)).size;
  const noticeCounts = { critical: notices.filter((n) => n.severity === "CRITICAL").length, high: notices.filter((n) => n.severity === "HIGH").length };
  const stale = positions.filter((p) => p.position && (p.position.stale_status === "STALE_WARNING" || p.position.stale_status === "FEED_OFFLINE")).length;
  const scopeCount = principal?.jurisdiction_ids?.length ?? 0;

  const exportBriefing = () => {
    const headers = ["Metric", "Value"];
    const rows = [
      ["Report Title", "PARVA North-East Operational Briefing"],
      ["Generated At", new Date().toISOString()],
      ["Authority Scope", isDistrictOfficer ? `${assignedDistrict} District Administration` : isStateAuthority ? `${assignedState} Department of Transport` : (principal?.org_name ?? "NER Regional Government Authority")],
      ["Verified Open Road Ratio", roads.openLengthShare === null ? "—" : `${Math.round(roads.openLengthShare * 100)}%`],
      ["Restricted Road Segments", String(roads.byStatus.RESTRICTED)],
      ["Blocked Road Segments", String(roads.byStatus.BLOCKED)],
      ["Caution or Unknown Segments", String(roads.byStatus.PROVISIONAL_CAUTION + roads.byStatus.UNKNOWN)],
      ["Active Incidents", String(activeInc.length)],
      ["Critical Incidents", String(activeInc.filter((i) => i.severity === "CRITICAL").length)],
      ["Isolated Critical Facilities", String(isolated)],
      ["Critical & High Alerts", String(noticeCounts.critical + noticeCounts.high)],
    ];
    downloadText("parva_operational_briefing.csv", toCsv(headers, rows), "text/csv");
  };

  return (
    <div className="stack">
      <PageHeader
        title={
          isDistrictOfficer
            ? `District Command Overview — ${assignedDistrict}`
            : isStateAuthority
            ? `State Command Overview — ${assignedState}`
            : "Command overview"
        }
        subtitle={
          isDistrictOfficer
            ? `Kamrup Metropolitan Administration · District Incident Verifier Scope. Scoped to ${assignedDistrict} (${assignedState}) road network, circles, and field reports.`
            : isStateAuthority
            ? `Assam State Department of Transport · State Authority Scope. Scoped to ${assignedState} road network, district connectivity, and state incidents.`
            : `Scope: ${principal?.org_name ?? ""} · ${scopeCount} assigned jurisdiction(s). The server limits everything below to this scope.`
        }
        actions={
          <div className="row" style={{ gap: "0.5rem", alignItems: "center" }}>
            <GlobalSearch />
            <Button size="small" onClick={exportBriefing}>
              Export Briefing (CSV)
            </Button>
          </div>
        }
      />
      {isDistrictOfficer && (
        <div
          style={{
            background: "linear-gradient(90deg, #064e3b 0%, #065f46 100%)",
            color: "#ffffff",
            padding: "0.9rem 1.25rem",
            borderRadius: "12px",
            border: "1px solid #10b981",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            boxShadow: "0 4px 15px rgba(16, 185, 129, 0.15)",
          }}
        >
          <div>
            <div style={{ fontWeight: 800, fontSize: "0.95rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <span>📋</span> District Incident Verifier: {principal?.display_name || "Chitralekha Devi"}
            </div>
            <div style={{ fontSize: "0.8rem", color: "#a7f3d0", marginTop: "0.2rem" }}>
              Active Jurisdiction: <strong>{assignedDistrict} District ({assignedState})</strong> — Circles: Guwahati Urban, Dispur, Azara, Sonapur, North Guwahati, Chandrapur.
            </div>
          </div>
          <span
            style={{
              fontSize: "0.75rem",
              fontWeight: 700,
              background: "#10b981",
              color: "#ffffff",
              padding: "0.25rem 0.65rem",
              borderRadius: "6px",
            }}
          >
            ● {assignedDistrict} Scope Active
          </span>
        </div>
      )}
      {!isDistrictOfficer && isStateAuthority && (
        <div
          style={{
            background: "linear-gradient(90deg, #091e3a 0%, #1e3a5f 100%)",
            color: "#ffffff",
            padding: "0.9rem 1.25rem",
            borderRadius: "12px",
            border: "1px solid #0284c7",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            boxShadow: "0 4px 15px rgba(2, 132, 199, 0.15)",
          }}
        >
          <div>
            <div style={{ fontWeight: 800, fontSize: "0.95rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <span>🏛️</span> State Authority Command: {principal?.display_name || "Bhaskar Singh"}
            </div>
            <div style={{ fontSize: "0.8rem", color: "#94a3b8", marginTop: "0.2rem" }}>
              Active Jurisdiction: <strong>{assignedState} State</strong> (Highways NH-27, NH-6 Assam section, Kamrup, Guwahati, Nagaon, Jorhat).
            </div>
          </div>
          <span
            style={{
              fontSize: "0.75rem",
              fontWeight: 700,
              background: "#0284c7",
              color: "#ffffff",
              padding: "0.25rem 0.65rem",
              borderRadius: "6px",
            }}
          >
            ● {assignedState} Scope Active
          </span>
        </div>
      )}
      {edges.isError ? <ErrorNotice error={edges.error} subject="the road network" onRetry={() => void edges.refetch()} /> : null}
      <CoverageBanner known={[{ label: "road segments", count: roads.total }, { label: "facilities", count: facilities.data?.length ?? 0 }]} truncated={features.length >= EDGE_LIMIT} note="Percentages describe only the imported network." />

      <h2>Connectivity</h2>
      <div className="grid cols-4">
        <Card><Stat label="Verified open (by length)" value={roads.openLengthShare === null ? "—" : `${Math.round(roads.openLengthShare * 100)}%`} hint={`${roads.byStatus.OPEN} of ${roads.total} segments`} /></Card>
        <Card><Stat label="Restricted segments" value={roads.byStatus.RESTRICTED} /></Card>
        <Card><Stat label="Blocked segments" value={roads.byStatus.BLOCKED} /></Card>
        <Card><Stat label="Caution or unknown" value={roads.byStatus.PROVISIONAL_CAUTION + roads.byStatus.UNKNOWN} hint="Not verified open" /></Card>
      </div>

      <h2>Incidents</h2>
      <div className="grid cols-4">
        <Card><Stat label="Active incidents" value={incidents.isPending ? "…" : activeInc.length} /></Card>
        <Card><Stat label="Critical, active" value={incidents.isPending ? "…" : activeInc.filter((i) => i.severity === "CRITICAL").length} /></Card>
        <Card><Stat label="Unverified reports" value={!can("VIEW_REPORT_SUMMARY") ? "n/a" : reports.isPending ? "…" : rep.filter((r) => r.review_state === "SUBMITTED" || r.review_state === "PROVISIONAL_CAUTION").length} hint={can("VIEW_REPORT_SUMMARY") ? "Awaiting a reviewer" : "Not in your role"} /></Card>
        <Card><Stat label="Resolved incidents" value={incidents.isPending ? "…" : inc.filter((i) => i.lifecycle === "RESOLVED").length} /></Card>
      </div>
      {incidents.isError ? <ErrorNotice error={incidents.error} subject="incidents" /> : null}

      <h2>Impact</h2>
      <div className="grid cols-4">
        <Card><Stat label="Facilities isolated" value={impact.loading ? "…" : isolated} /></Card>
        <Card><Stat label="Active trips impacted" value={!fleetVisible ? "n/a" : impact.loading ? "…" : new Set(impact.tripImpacts.map((t) => t.trip.id)).size} hint={fleetVisible ? undefined : "Fleet not in your role"} /></Card>
        <Card><Stat label="Critical + high notices" value={noticesLoading ? "…" : noticeCounts.critical + noticeCounts.high} /></Card>
        <Card><Link href="/gov/impact">Open the impact board</Link></Card>
      </div>

      {fleetVisible ? (
        <>
          <h2>Logistics and vehicles</h2>
          <div className="grid cols-4">
            <Card><Stat label="Active trips" value={trips.isPending ? "…" : (trips.data ?? []).filter((t) => ["DISPATCHED", "IN_TRANSIT", "HELD_FOR_INSPECTION", "DIVERTED"].includes(t.status)).length} /></Card>
            <Card><Stat label="Deliveries at risk" value={commitments.isPending ? "…" : (commitments.data ?? []).filter((c) => c.sla_status === "AT_RISK").length} /></Card>
            <Card><Stat label="Deadline missed" value={commitments.isPending ? "…" : (commitments.data ?? []).filter((c) => c.sla_status === "BREACHED").length} /></Card>
            <Card><Stat label="Vehicles with stale GPS" value={vehicles.isPending ? "…" : stale} hint={`${vehicles.data?.length ?? 0} registered`} /></Card>
          </div>
        </>
      ) : (
        <Banner tone="neutral" title="Logistics figures hidden"><p className="small">Your role does not include fleet visibility.</p></Banner>
      )}

      <div className="split">
        <Card title="Roads needing attention" actions={<Link href="/gov/map">Full map</Link>}>
          <MapView
            ariaLabel="Blocked, restricted and unverified road segments, with landslide risk zones"
            lines={lines}
            hazardZones={hazard.data?.zones ?? []}
            height={340}
            fitBounds={activeBBox}
            fitKey={isDistrictOfficer ? assignedDistrict : isStateAuthority ? assignedState : "NER"}
          />
          <MapLegend lines={lines} hazardZones={hazard.data?.zones ?? []} />
        </Card>
        <Card title="Top notices" actions={<Link href="/gov/alerts">All notices</Link>}>
          <NoticeList notices={notices.slice(0, 6)} emptyText="No notices from visible records." />
        </Card>
      </div>
      <p className="small muted">Comparisons between states or districts need jurisdiction names, which the API does not expose yet, so they are not shown.</p>
    </div>
  );
}
