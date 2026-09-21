"use client";

import Link from "next/link";
import { useMemo } from "react";
import { humanize } from "@/shared/lib/format";
import { formatDateTime, formatDuration } from "@/shared/lib/time";
import { Banner, Card, ErrorNotice, Stat, StatusBadge } from "@/shared/ui";
import { useImpactData } from "./useImpactData";

export function ImpactChain({ isolated, facilities, trips, consignments, tier1 }: { isolated: number; facilities: number; trips: number; consignments: number; tier1: number }) {
  return (
    <ol className="row" style={{ listStyle: "none", padding: 0, margin: 0 }} aria-label="Impact chain">
      {[
        [`${facilities} facilities affected`, `${isolated} isolated`],
        [`${trips} active trips affected`, ""],
        [`${consignments} consignments on those trips`, `${tier1} life-saving (tier 1)`],
      ].map(([a, b], i) => (
        <li key={i} className="card" style={{ padding: "0.6rem 0.9rem" }}>
          <strong>{a}</strong>{b ? <div className="small muted">{b}</div> : null}
        </li>
      ))}
    </ol>
  );
}

export function ImpactBoard({ tripBase = "/gov/fleet/trips" }: { tripBase?: string }) {
  const data = useImpactData();
  const summary = useMemo(() => {
    const isolated = new Set(data.facilityImpacts.filter((f) => f.impact.isolated).map((f) => f.facility.id)).size;
    const affectedFacilities = new Set(data.facilityImpacts.filter((f) => f.impact.reachability_state !== "REACHABLE").map((f) => f.facility.id)).size;
    const trips = new Set(data.tripImpacts.map((t) => t.trip.id));
    const commitments = new Map<string, boolean>();
    for (const t of data.tripImpacts) for (const c of t.commitments) commitments.set(c.id, c.priority_tier === "TIER_1_LIFE_SAVING");
    return { isolated, affectedFacilities, trips: trips.size, consignments: commitments.size, tier1: [...commitments.values()].filter(Boolean).length };
  }, [data]);

  return (
    <div className="stack">
      {data.errors.length ? <ErrorNotice error={data.errors[0]} subject="some impact records" /> : null}
      {data.facilitiesTruncated ? <Banner tone="warn" title="Partial view"><p className="small">Only the first critical/registered facilities were queried. The impact API has no aggregate endpoint yet.</p></Banner> : null}
      {!data.fleetVisible ? <Banner tone="neutral" title="Trips and consignments not shown"><p className="small">Your role does not include fleet visibility, so only facility impacts are listed.</p></Banner> : null}
      {data.loading ? <p role="status" className="muted">Assessing impacts…</p> : null}

      <Card title="Impact chain">
        <ImpactChain isolated={summary.isolated} facilities={summary.affectedFacilities} trips={summary.trips} consignments={summary.consignments} tier1={summary.tier1} />
        <p className="small muted">Counts come from impact assessments recorded by the server for the current road status. No assessment recorded is not proof that nothing is affected.</p>
      </Card>

      <div className="grid cols-4">
        <Card><Stat label="Facilities isolated" value={summary.isolated} /></Card>
        <Card><Stat label="Facilities with reduced access" value={summary.affectedFacilities} /></Card>
        <Card><Stat label="Active trips impacted" value={summary.trips} /></Card>
        <Card><Stat label="Tier 1 consignments impacted" value={summary.tier1} /></Card>
      </div>

      <Card title="Facility impacts">
        {data.facilityImpacts.length === 0 && !data.loading ? <p className="muted">No facility impacts recorded in your scope.</p> : (
          <div className="table-wrap"><table>
            <caption className="sr-only">Facility impacts</caption>
            <thead><tr><th scope="col">Facility</th><th scope="col">Access</th><th scope="col">Alternate route</th><th scope="col">Added delay</th><th scope="col">Assessed</th></tr></thead>
            <tbody>
              {data.facilityImpacts.map(({ impact, facility }) => (
                <tr key={impact.id}>
                  <td>{facility.name}<div className="small muted">{humanize(facility.kind)}{facility.is_critical ? " · critical" : ""}</div></td>
                  <td><StatusBadge kind="reach" value={impact.reachability_state} />{impact.isolated ? <span className="badge tone-danger">Isolated</span> : null}</td>
                  <td>{impact.alternate_route_available ? "Available" : "None found"}</td>
                  <td>{formatDuration(impact.access_delay_seconds)}</td>
                  <td>{formatDateTime(impact.assessed_at)}<div className="small muted">status version {impact.source_status_version}</div></td>
                </tr>
              ))}
            </tbody>
          </table></div>
        )}
      </Card>

      {data.fleetVisible ? (
        <Card title="Trip impacts">
          {data.tripImpacts.length === 0 && !data.loading ? <p className="muted">No active trip impacts recorded.</p> : (
            <div className="table-wrap"><table>
              <caption className="sr-only">Trip impacts</caption>
              <thead><tr><th scope="col">Trip</th><th scope="col">Impact</th><th scope="col">Action</th><th scope="col">Delay</th><th scope="col">Consignments</th></tr></thead>
              <tbody>
                {data.tripImpacts.map(({ impact, trip, commitments }) => (
                  <tr key={impact.id}>
                    <td><Link href={`${tripBase}/${trip.id}`}>{trip.trip_code}</Link></td>
                    <td><StatusBadge kind="impact" value={impact.impact_type} /> <StatusBadge kind="severity" value={impact.severity} /></td>
                    <td>{humanize(impact.recommended_action)}</td>
                    <td>{formatDuration(impact.delay_estimated_seconds)}</td>
                    <td>{commitments.length ? commitments.map((c) => c.consignment_reference).join(", ") : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table></div>
          )}
        </Card>
      ) : null}
    </div>
  );
}
