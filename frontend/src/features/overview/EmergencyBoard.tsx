"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useSession } from "@/shared/auth";
import { NER_BBOX } from "@/shared/lib/geo";
import { humanize } from "@/shared/lib/format";
import { formatDateTime } from "@/shared/lib/time";
import { Banner, Card, CoverageBanner, PageHeader, StatusBadge, useEmergencyMode } from "@/shared/ui";
import { NoticeList, useGovernmentNotices } from "@/features/alerts";
import { useCommitments, useFleetPositions, useTrips, useVehicles } from "@/features/fleet";
import { useImpactData } from "@/features/impact";
import { useIncidents } from "@/features/incidents";
import { EDGE_LIMIT, edgeLabel, sortBySeverity, useEdges, useFacilities } from "@/features/network";
import { RouteEvaluator } from "@/features/routing";

/**
 * Emergency operations view. It reorders and highlights information that already exists;
 * it grants no permission and changes no record.
 */
export function EmergencyBoard() {
  const { can } = useSession();
  const [on, setOn] = useEmergencyMode();
  const incidents = useIncidents("ACTIVE");
  const edges = useEdges(NER_BBOX, 6);
  const facilities = useFacilities();
  const impact = useImpactData();
  const fleet = can("VIEW_FLEET");
  const commitments = useCommitments(undefined, fleet);
  const vehicles = useVehicles(fleet);
  const trips = useTrips(undefined, fleet);
  const positions = useFleetPositions(vehicles.data);
  const { notices } = useGovernmentNotices();

  const critical = (incidents.data ?? []).filter((i) => i.severity === "CRITICAL" || i.severity === "HIGH");
  const blocked = useMemo(() => sortBySeverity(edges.data?.features ?? []).filter((f) => f.props.accessibility_status === "BLOCKED" || f.props.accessibility_status === "RESTRICTED").slice(0, 12), [edges.data]);
  const isolatedCritical = impact.facilityImpacts.filter((f) => f.impact.isolated && f.facility.is_critical);
  const tier1 = (commitments.data ?? []).filter((c) => c.priority_tier === "TIER_1_LIFE_SAVING" && c.sla_status !== "ON_TIME" && c.status !== "DELIVERED");
  const affectedTripIds = new Set(impact.tripImpacts.map((t) => t.trip.id));
  const staleWithTrips = positions.filter((p) => p.position && (p.position.stale_status === "STALE_WARNING" || p.position.stale_status === "FEED_OFFLINE") && (trips.data ?? []).some((t) => t.vehicle_id === p.vehicle.id && ["DISPATCHED", "IN_TRANSIT"].includes(t.status)));

  return (
    <div className="stack">
      <PageHeader
        title="Emergency operations"
        subtitle="Highest-priority information first."
        actions={can("RESPOND_EMERGENCY") ? <label className="row"><input type="checkbox" checked={on} onChange={(e) => setOn(e.target.checked)} /> Emergency mode (highlight the rest of the portal)</label> : null}
      />
      <Banner tone="info" title="Presentation only"><p className="small">Emergency mode changes what is shown first. It does not grant permissions or change any road status, incident or delivery.</p></Banner>
      <CoverageBanner known={[{ label: "road segments", count: edges.data?.count ?? 0 }, { label: "facilities", count: facilities.data?.length ?? 0 }]} truncated={(edges.data?.count ?? 0) >= EDGE_LIMIT} />

      <div className="grid cols-2">
        <Card title={`Critical and high incidents (${critical.length})`}>
          {critical.length === 0 ? <p className="muted">No active critical or high incidents in your scope.</p> : (
            <ul className="stack" style={{ listStyle: "none", padding: 0, margin: 0 }}>
              {critical.map((i) => <li key={i.id} className="row"><StatusBadge kind="severity" value={i.severity} /><Link href={`/gov/incidents/${i.id}`}>{i.title}</Link><span className="small muted right">{formatDateTime(i.created_at)}</span></li>)}
            </ul>
          )}
        </Card>
        <Card title={`Blocked and restricted roads (${blocked.length}${(edges.data?.count ?? 0) >= EDGE_LIMIT ? "+" : ""})`}>
          {blocked.length === 0 ? <p className="muted">None in the loaded network. Roads outside the imported network are not covered.</p> : (
            <ul className="stack" style={{ listStyle: "none", padding: 0, margin: 0 }}>
              {blocked.map((f) => <li key={f.id} className="row"><StatusBadge kind="access" value={f.props.accessibility_status} />{edgeLabel(f)}</li>)}
            </ul>
          )}
          <p className="small"><Link href="/gov/map">Open the accessibility map</Link></p>
        </Card>
        <Card title={`Isolated critical facilities (${isolatedCritical.length})`}>
          {isolatedCritical.length === 0 ? <p className="muted">No critical facility is recorded as isolated.</p> : (
            <ul className="stack" style={{ listStyle: "none", padding: 0, margin: 0 }}>
              {isolatedCritical.map(({ facility, impact: i }) => <li key={i.id} className="row"><StatusBadge kind="reach" value={i.reachability_state} />{facility.name} <span className="small muted">{humanize(facility.kind)}</span></li>)}
            </ul>
          )}
        </Card>
        <Card title={`Life-saving deliveries not on time (${fleet ? tier1.length : "n/a"})`}>
          {!fleet ? <p className="muted">Fleet visibility is not part of your role.</p> : tier1.length === 0 ? <p className="muted">All tier 1 consignments are on time.</p> : (
            <ul className="stack" style={{ listStyle: "none", padding: 0, margin: 0 }}>
              {tier1.map((c) => <li key={c.id} className="row"><StatusBadge kind="sla" value={c.sla_status} />{c.consignment_reference}<span className="small muted">{humanize(c.cargo_category)}</span></li>)}
            </ul>
          )}
        </Card>
        {fleet ? (
          <Card title={`Vehicles: ${affectedTripIds.size} trip(s) impacted, ${staleWithTrips.length} with stale GPS`}>
            <ul className="stack" style={{ listStyle: "none", padding: 0, margin: 0 }}>
              {impact.tripImpacts.slice(0, 8).map(({ impact: i, trip }) => <li key={i.id} className="row"><StatusBadge kind="impact" value={i.impact_type} /><Link href={`/gov/fleet/trips/${trip.id}`}>{trip.trip_code}</Link></li>)}
              {staleWithTrips.map((p) => <li key={p.vehicle.id} className="row"><StatusBadge kind="gps" value={p.position?.stale_status} /><Link href={`/gov/fleet/vehicles/${p.vehicle.id}`}>{p.vehicle.registration_number}</Link></li>)}
              {impact.tripImpacts.length === 0 && staleWithTrips.length === 0 ? <li className="muted">No impacted trips or stale in-transit vehicles recorded.</li> : null}
            </ul>
          </Card>
        ) : null}
        <Card title="Emergency notices">
          <NoticeList notices={notices.filter((n) => n.severity === "CRITICAL" || n.severity === "HIGH").slice(0, 8)} emptyText="No critical or high notices." />
        </Card>
      </div>

      {can("COMPUTE_ROUTE") ? (
        <>
          <h2>Emergency route planner</h2>
          <p className="small muted">Uses the tier 1 (life-saving) priority and the conservative policy by default. An emergency type is not an input of the routing service, so it is not asked for.</p>
          <RouteEvaluator facilities={facilities.data ?? []} initial={{ priority: "TIER_1_LIFE_SAVING" }} />
        </>
      ) : (
        <Banner tone="neutral" title="Route planning not in your role"><p className="small">Emergency coordinators with route permission can plan routes here.</p></Banner>
      )}
    </div>
  );
}
