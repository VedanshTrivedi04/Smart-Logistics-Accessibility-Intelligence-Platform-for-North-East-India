"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useSession } from "@/shared/auth";
import { humanize } from "@/shared/lib/format";
import { useNow } from "@/shared/lib/useNow";
import { Banner, Bars, Card, ErrorNotice, PageHeader, Stat } from "@/shared/ui";
import { NoticeList, useLogisticsNotices } from "@/features/alerts";
import { describeGps, useCommitments, useFleetPositions, useTrips, useVehicles } from "@/features/fleet";
import { useImpactData } from "@/features/impact";

export function LogisticsOverview() {
  const { can, principal } = useSession();
  const fleet = can("VIEW_FLEET");
  const vehicles = useVehicles(fleet);
  const trips = useTrips(undefined, fleet);
  const commitments = useCommitments(undefined, fleet);
  const positions = useFleetPositions(vehicles.data);
  const impact = useImpactData();
  const { notices } = useLogisticsNotices();
  const now = useNow(30_000);

  const gps = useMemo(() => {
    const d = positions.map((p) => describeGps(p.position, now));
    return { live: d.filter((x) => x.live).length, stale: d.filter((x) => x.stale).length, never: d.filter((x) => x.neverReported).length };
  }, [positions, now]);
  const tripCounts = useMemo(() => {
    const c = new Map<string, number>();
    for (const t of trips.data ?? []) c.set(t.status, (c.get(t.status) ?? 0) + 1);
    return [...c.entries()].map(([label, value]) => ({ label: humanize(label), value }));
  }, [trips.data]);

  if (!fleet) {
    return (
      <div className="stack">
        <PageHeader title="Logistics" />
        <Banner tone="neutral" title="No fleet view for your role">
          <p className="small">Your role ({principal?.role}) can send GPS but cannot list vehicles, trips or deliveries. Ask a fleet manager or delivery coordinator if you need those.</p>
        </Banner>
      </div>
    );
  }

  const cm = commitments.data ?? [];
  return (
    <div className="stack">
      <PageHeader title="Logistics overview" subtitle={`${principal?.org_name ?? ""} — figures cover this organization only.`} />
      {[vehicles.error, trips.error, commitments.error].filter(Boolean).slice(0, 1).map((e, i) => <ErrorNotice key={i} error={e} subject="fleet data" />)}
      <div className="grid cols-4">
        <Card><Stat label="Vehicles registered" value={vehicles.isPending ? "…" : vehicles.data?.length ?? 0} hint={`${(vehicles.data ?? []).filter((v) => v.is_active).length} active records`} /></Card>
        <Card><Stat label="GPS current" value={gps.live} hint={`${gps.stale} stale · ${gps.never} never reported`} /></Card>
        <Card><Stat label="Active trips" value={trips.isPending ? "…" : (trips.data ?? []).filter((t) => ["DISPATCHED", "IN_TRANSIT", "HELD_FOR_INSPECTION", "DIVERTED"].includes(t.status)).length} /></Card>
        <Card><Stat label="Trips with active impacts" value={impact.loading ? "…" : new Set(impact.tripImpacts.map((t) => t.trip.id)).size} /></Card>
        <Card><Stat label="Consignments" value={commitments.isPending ? "…" : cm.length} /></Card>
        <Card><Stat label="At risk" value={cm.filter((c) => c.sla_status === "AT_RISK").length} /></Card>
        <Card><Stat label="Deadline missed" value={cm.filter((c) => c.sla_status === "BREACHED").length} /></Card>
        <Card><Stat label="Delivered" value={cm.filter((c) => c.status === "DELIVERED").length} /></Card>
      </div>
      <div className="split">
        <Card title="Trips by status">{tripCounts.length ? <Bars rows={tripCounts} ariaLabel="Trips by status" /> : <p className="muted">No trips yet.</p>}</Card>
        <Card title="Notices" actions={<Link href="/logistics/alerts">All notices</Link>}><NoticeList notices={notices.slice(0, 6)} emptyText="No notices for your fleet." /></Card>
      </div>
      <div className="row">
        <Link className="btn" href="/logistics/fleet">Live fleet map</Link>
        <Link className="btn" href="/logistics/trips">Trips</Link>
        <Link className="btn" href="/logistics/deliveries">Deliveries</Link>
        <Link className="btn" href="/logistics/routes">Route tool</Link>
      </div>
    </div>
  );
}
