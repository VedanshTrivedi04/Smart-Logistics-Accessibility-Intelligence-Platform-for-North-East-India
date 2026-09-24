"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useSession } from "@/shared/auth";
import { NER_BBOX } from "@/shared/lib/geo";
import { humanize } from "@/shared/lib/format";
import { Banner, Button, Card, CoverageBanner, ErrorNotice, StatusBadge } from "@/shared/ui";
import { useJurisdictionIndex } from "@/features/coordination";
import { useImpactData } from "@/features/impact";
import { useIncidents, useReports } from "@/features/incidents";
import { EDGE_LIMIT, edgeLabel, useEdges, useFacilities } from "@/features/network";
import { buildStateBreakdown, type StateRow } from "./breakdown";

const LIST_MAX = 15;

function StateDetail({ row, fleetVisible, onClose }: { row: StateRow; fleetVisible: boolean; onClose: () => void }) {
  const disrupted = [...row.roads.blocked, ...row.roads.restricted];
  return (
    <Card title={row.state.name} actions={<Button size="small" onClick={onClose}>Back to all states</Button>}>
      <div className="stack">
        <section aria-labelledby="st-inc">
          <h3 id="st-inc">Incidents ({row.activeIncidents.length} active)</h3>
          {row.activeIncidents.length ? (
            <ul className="stack" style={{ listStyle: "none", padding: 0, margin: 0 }}>
              {row.activeIncidents.slice(0, LIST_MAX).map((i) => (
                <li key={i.id} className="row"><StatusBadge kind="severity" value={i.severity} /><Link href={`/gov/incidents/${i.id}`}>{i.title || "Incident"}</Link></li>
              ))}
            </ul>
          ) : <p className="muted">No active incidents placed in this state.</p>}
          <p className="small muted">{row.unverifiedReports} field report(s) awaiting review. <Link href="/gov/reports">Open reports</Link></p>
        </section>

        <section aria-labelledby="st-roads">
          <h3 id="st-roads">Roads ({row.roads.blocked.length} blocked, {row.roads.restricted.length} restricted of {row.roads.total} segments loaded)</h3>
          {disrupted.length ? (
            <ul className="stack" style={{ listStyle: "none", padding: 0, margin: 0 }}>
              {disrupted.slice(0, LIST_MAX).map((e) => (
                <li key={e.id} className="row"><StatusBadge kind="access" value={e.props.accessibility_status} />{edgeLabel(e)}</li>
              ))}
            </ul>
          ) : <p className="muted">No blocked or restricted segments among the segments loaded for this state.</p>}
          {disrupted.length > LIST_MAX ? <p className="small muted">Showing {LIST_MAX} of {disrupted.length}. <Link href="/gov/map">Open the map</Link></p> : null}
        </section>

        <section aria-labelledby="st-log">
          <h3 id="st-log">Logistics</h3>
          {fleetVisible ? (
            <>
              <p>{row.trips.length} trip(s) affected by incidents in this state; {row.atRiskDeliveries} delivery deadline(s) at risk, {row.breachedDeliveries} missed.</p>
              {row.trips.length ? (
                <ul className="stack" style={{ listStyle: "none", padding: 0, margin: 0 }}>
                  {row.trips.slice(0, LIST_MAX).map((t) => <li key={t.id}><Link href={`/gov/fleet/trips/${t.id}`}>{t.trip_code}</Link></li>)}
                </ul>
              ) : null}
            </>
          ) : <p className="muted">Your role does not include fleet visibility.</p>}
        </section>

        <section aria-labelledby="st-fac">
          <h3 id="st-fac">Facilities ({row.isolatedFacilities.length} isolated of {row.facilities})</h3>
          {row.isolatedFacilities.length ? (
            <ul className="stack" style={{ listStyle: "none", padding: 0, margin: 0 }}>
              {row.isolatedFacilities.map((f) => <li key={f.id}>{f.name} <span className="small muted">{humanize(f.kind)}{f.is_critical ? " · critical" : ""}</span></li>)}
            </ul>
          ) : <p className="muted">No isolated facilities recorded.</p>}
        </section>
      </div>
    </Card>
  );
}

/**
 * State-by-state comparison and drill-down. Records are placed by the jurisdiction the API returns for them;
 * anything without one is counted as unattributed rather than guessed.
 */
export function RegionalBreakdown() {
  const { can } = useSession();
  const index = useJurisdictionIndex();
  const edges = useEdges(NER_BBOX, 6);
  const facilities = useFacilities();
  const incidents = useIncidents();
  const reportsVisible = can("VIEW_REPORT_SUMMARY");
  const reports = useReports(undefined, reportsVisible);
  const impact = useImpactData();
  const [selected, setSelected] = useState<string | null>(null);

  const features = useMemo(() => edges.data?.features ?? [], [edges.data]);
  const breakdown = useMemo(
    () =>
      buildStateBreakdown({
        states: index.states,
        stateOf: index.stateOf,
        incidents: incidents.data ?? [],
        reports: reports.data ?? [],
        edges: features,
        facilities: facilities.data ?? [],
        facilityImpacts: impact.facilityImpacts,
        tripImpacts: impact.tripImpacts,
      }),
    [index.states, index.stateOf, incidents.data, reports.data, features, facilities.data, impact.facilityImpacts, impact.tripImpacts],
  );

  const row = selected ? breakdown.rows.find((r) => r.state.id === selected) ?? null : null;
  const loading = index.isPending || incidents.isPending || edges.isPending || impact.loading;
  const u = breakdown.unattributed;
  const unplaced = [
    u.activeIncidents ? `${u.activeIncidents} active incident(s)` : "",
    u.roads ? `${u.roads} road segment(s)` : "",
    u.facilities ? `${u.facilities} facility(ies)` : "",
    u.trips ? `${u.trips} affected trip(s)` : "",
    u.reports ? `${u.reports} report(s)` : "",
  ].filter(Boolean);

  return (
    <div className="stack">
      {index.error ? <ErrorNotice error={index.error} subject="states" /> : null}
      {edges.isError ? <ErrorNotice error={edges.error} subject="the road network" onRetry={() => void edges.refetch()} /> : null}
      {incidents.isError ? <ErrorNotice error={incidents.error} subject="incidents" /> : null}
      {impact.errors.length ? <ErrorNotice error={impact.errors[0]} subject="some impact records" /> : null}
      <CoverageBanner known={[{ label: "road segments", count: features.length }, { label: "facilities", count: facilities.data?.length ?? 0 }]} truncated={features.length >= EDGE_LIMIT} />
      {!reportsVisible ? <Banner tone="neutral" title="Incidents cannot be placed"><p className="small">An incident takes its state from its report, and your role cannot read reports, so incident counts appear as unplaced.</p></Banner> : null}
      {loading ? <p role="status" className="muted">Loading states…</p> : null}

      {row ? (
        <StateDetail row={row} fleetVisible={impact.fleetVisible} onClose={() => setSelected(null)} />
      ) : (
        <Card title="States, most affected first">
          <div className="table-wrap">
            <table>
              <caption className="sr-only">States compared by incidents, roads, facilities and logistics</caption>
              <thead>
                <tr>
                  <th scope="col">State</th>
                  <th scope="col">Active incidents</th>
                  <th scope="col">Blocked / restricted segments</th>
                  <th scope="col">Facilities isolated</th>
                  <th scope="col">Trips affected</th>
                  <th scope="col">Deliveries at risk / missed</th>
                </tr>
              </thead>
              <tbody>
                {breakdown.rows.map((r) => (
                  <tr key={r.state.id}>
                    <td><button type="button" className="linkish" onClick={() => setSelected(r.state.id)}>{r.state.name}</button></td>
                    <td>{r.activeIncidents.length}{r.criticalIncidents ? <span className="small muted"> ({r.criticalIncidents} critical)</span> : null}</td>
                    <td>{r.roads.blocked.length} / {r.roads.restricted.length}</td>
                    <td>{r.isolatedFacilities.length} of {r.facilities}</td>
                    <td>{impact.fleetVisible ? r.trips.length : "n/a"}</td>
                    <td>{impact.fleetVisible ? `${r.atRiskDeliveries} / ${r.breachedDeliveries}` : "n/a"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="small muted">Ranked by critical incidents, then isolated facilities, missed deadlines, affected trips, blocked segments and active incidents. Trips are placed by the incident they are affected by, so trips with no linked incident are unplaced.</p>
          {unplaced.length ? <Banner tone="warn" title="Not placed in any state"><p className="small">{unplaced.join(", ")} have no state on record, so they are not in the table above.</p></Banner> : null}
        </Card>
      )}
    </div>
  );
}
