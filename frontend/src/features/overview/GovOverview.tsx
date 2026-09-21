"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useSession } from "@/shared/auth";
import { NER_BBOX } from "@/shared/lib/geo";
import { MapLegend, MapView } from "@/shared/map";
import { Banner, Card, CoverageBanner, ErrorNotice, PageHeader, Stat } from "@/shared/ui";
import { NoticeList, useGovernmentNotices } from "@/features/alerts";
import { useCommitments, useFleetPositions, useTrips, useVehicles } from "@/features/fleet";
import { useImpactData } from "@/features/impact";
import { useIncidents, useReports } from "@/features/incidents";
import { EDGE_LIMIT, edgeLines, summarizeEdges, useEdges, useFacilities } from "@/features/network";

/** Command overview: every figure is computed from records the server returned for this user's scope. */
export function GovOverview() {
  const { principal, can } = useSession();
  const edges = useEdges(NER_BBOX, 6);
  const facilities = useFacilities();
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

  return (
    <div className="stack">
      <PageHeader title="Command overview" subtitle={`Scope: ${principal?.org_name ?? ""} · ${scopeCount} assigned jurisdiction(s). The server limits everything below to this scope.`} />
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
          <MapView ariaLabel="Blocked, restricted and unverified road segments" lines={lines} height={340} />
          <MapLegend />
        </Card>
        <Card title="Top notices" actions={<Link href="/gov/alerts">All notices</Link>}>
          <NoticeList notices={notices.slice(0, 6)} emptyText="No notices from visible records." />
        </Card>
      </div>
      <p className="small muted">Comparisons between states or districts need jurisdiction names, which the API does not expose yet, so they are not shown.</p>
    </div>
  );
}
