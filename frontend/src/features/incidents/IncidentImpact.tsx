"use client";

import Link from "next/link";
import { useMemo } from "react";
import { humanize } from "@/shared/lib/format";
import { formatDateTime, formatDuration } from "@/shared/lib/time";
import { Banner, Card, ErrorNotice, Stat, StatusBadge } from "@/shared/ui";
import { useImpactData } from "@/features/impact";

export type ImpactLevel = "NONE RECORDED" | "LOW" | "MODERATE" | "HIGH" | "CRITICAL";

/**
 * One level for the incident, taken from its worst recorded effect: an isolated critical facility or
 * a critical trip impact is CRITICAL; an isolated facility, a high trip impact or a missed deadline is HIGH.
 */
export function regionalImpactLevel(tripSeverities: readonly string[], facilities: ReadonlyArray<{ isolated: boolean; critical: boolean }>, breachedDeliveries: number): ImpactLevel {
  if (facilities.some((f) => f.isolated && f.critical) || tripSeverities.includes("CRITICAL")) return "CRITICAL";
  if (facilities.some((f) => f.isolated) || tripSeverities.includes("HIGH") || breachedDeliveries > 0) return "HIGH";
  if (tripSeverities.includes("MODERATE") || facilities.length > 0) return "MODERATE";
  if (tripSeverities.length > 0) return "LOW";
  return "NONE RECORDED";
}

/**
 * Regional impact of one incident: the trips, consignments and facilities whose impact
 * assessments the server linked to it. Assessments without an incident link are not counted here.
 */
export function IncidentImpact({ incidentId, tripBase = "/gov/fleet/trips" }: { incidentId: string; tripBase?: string }) {
  const data = useImpactData();

  const trips = useMemo(() => data.tripImpacts.filter((t) => t.impact.incident_id === incidentId), [data.tripImpacts, incidentId]);
  const facilities = useMemo(() => data.facilityImpacts.filter((f) => f.impact.incident_id === incidentId), [data.facilityImpacts, incidentId]);
  const commitments = useMemo(() => {
    const byId = new Map<string, (typeof trips)[number]["commitments"][number]>();
    for (const t of trips) for (const c of t.commitments) byId.set(c.id, c);
    return [...byId.values()];
  }, [trips]);
  const isolated = facilities.filter((f) => f.impact.isolated).length;
  const breached = commitments.filter((c) => c.sla_status === "BREACHED").length;
  const level = regionalImpactLevel(trips.map((t) => t.impact.severity), facilities.map((f) => ({ isolated: f.impact.isolated, critical: f.facility.is_critical })), breached);

  return (
    <Card title="Regional impact of this incident">
      {data.errors.length ? <ErrorNotice error={data.errors[0]} subject="some impact records" /> : null}
      {data.loading ? <p role="status" className="muted">Assessing impacts…</p> : null}
      <div className="grid cols-3">
        <Stat label="Regional impact" value={data.loading ? "…" : level} hint="From recorded assessments" />
        <Stat label="Trips affected" value={data.fleetVisible ? trips.length : "n/a"} hint={data.fleetVisible ? undefined : "Fleet not in your role"} />
        <Stat label="Deliveries affected" value={data.fleetVisible ? commitments.length : "n/a"} hint={data.fleetVisible && breached ? `${breached} deadline missed` : undefined} />
        <Stat label="Facilities affected" value={facilities.length} />
        <Stat label="Facilities isolated" value={isolated} />
      </div>
      <p className="small muted">Counts come from impact assessments the server linked to this incident. None recorded is not proof that nothing is affected.</p>

      {data.fleetVisible ? (
        trips.length ? (
          <div className="table-wrap"><table>
            <caption className="sr-only">Trips affected by this incident</caption>
            <thead><tr><th scope="col">Trip</th><th scope="col">Impact</th><th scope="col">Recommended</th><th scope="col">Delay</th><th scope="col">Deliveries</th></tr></thead>
            <tbody>
              {trips.map(({ impact, trip, commitments: cs }) => (
                <tr key={impact.id}>
                  <td><Link href={`${tripBase}/${trip.id}`}>{trip.trip_code}</Link></td>
                  <td><StatusBadge kind="impact" value={impact.impact_type} /> <StatusBadge kind="severity" value={impact.severity} /></td>
                  <td>{humanize(impact.recommended_action)}<div className="small muted">System recommendation. Dispatch needs an authorized decision.</div></td>
                  <td>{formatDuration(impact.delay_estimated_seconds)}</td>
                  <td>{cs.length ? cs.map((c) => `${c.consignment_reference} (${humanize(c.sla_status)})`).join(", ") : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table></div>
        ) : data.loading ? null : <p className="muted">No trips linked to this incident.</p>
      ) : (
        <Banner tone="neutral" title="Trips and deliveries not shown"><p className="small">Your role does not include fleet visibility.</p></Banner>
      )}

      {facilities.length ? (
        <div className="table-wrap"><table>
          <caption className="sr-only">Facilities affected by this incident</caption>
          <thead><tr><th scope="col">Facility</th><th scope="col">Access</th><th scope="col">Added delay</th><th scope="col">Assessed</th></tr></thead>
          <tbody>
            {facilities.map(({ impact, facility }) => (
              <tr key={impact.id}>
                <td>{facility.name}<div className="small muted">{humanize(facility.kind)}{facility.is_critical ? " · critical" : ""}</div></td>
                <td><StatusBadge kind="reach" value={impact.reachability_state} />{impact.isolated ? <span className="badge tone-danger">Isolated</span> : null}</td>
                <td>{impact.access_delay_seconds ? formatDuration(impact.access_delay_seconds) : "—"}</td>
                <td>{formatDateTime(impact.assessed_at)}</td>
              </tr>
            ))}
          </tbody>
        </table></div>
      ) : data.loading ? null : <p className="muted">No facilities linked to this incident.</p>}
    </Card>
  );
}
