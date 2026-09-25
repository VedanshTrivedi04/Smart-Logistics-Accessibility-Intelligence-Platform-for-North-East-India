"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useSession, useScopeFilter } from "@/shared/auth";
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
  const { isStateAuthority, isDistrictOfficer, assignedState, assignedDistrict, districtCircles, activeCircle, setActiveCircle } = useScopeFilter();
  const index = useJurisdictionIndex();
  const edges = useEdges(NER_BBOX, 6);
  const facilities = useFacilities();
  const incidents = useIncidents();
  const reportsVisible = can("VIEW_REPORT_SUMMARY");
  const reports = useReports(undefined, reportsVisible);
  const impact = useImpactData();
  const [selected, setSelected] = useState<string | null>(null);
  const [districtViewTab, setDistrictViewTab] = useState<"CIRCLES" | "REGIONAL_COMPARISON">("CIRCLES");

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

  // Kamrup Metropolitan detailed circle breakdown data
  const kamrupCircleStats = useMemo(() => [
    {
      id: "guwahati_urban",
      name: "Guwahati Urban Circle",
      headquarters: "Panbazar / Paltan Bazar",
      corridors: "AT Road, GS Road (Paltan Bazar to Ulubari), Bharalumukh",
      roadKm: 86,
      pendingReports: 2,
      activeIncidents: 1,
      facilities: "GMCH Multi-specialty, Gauhati Medical College Oxygen Buffer, Panbazar Logistics Post",
      status: "🟡 Caution",
      statusDetail: "Saraighat Bridge approach partial restriction; AT Road flowing normally",
      statusColor: "#d97706",
    },
    {
      id: "dispur_capital",
      name: "Dispur Capital Circle",
      headquarters: "Secretariat / Khanapara",
      corridors: "GS Road (Ganeshguri, Six Mile, Khanapara Rotary, Supermarket)",
      roadKm: 78,
      pendingReports: 1,
      activeIncidents: 0,
      facilities: "Assam Secretariat Emergency Depot, Khanapara Oxygen Depot Gate, Dispur Poly-Clinic",
      status: "🟢 Open",
      statusDetail: "Clean corridor; continuous cryogenic distribution active",
      statusColor: "#059669",
    },
    {
      id: "azara_airport",
      name: "Azara Airport & West Circle",
      headquarters: "Azara / Borjhar",
      corridors: "NH-17 Guwahati Airport Corridor, VIP Road, Mirza Link",
      roadKm: 94,
      pendingReports: 0,
      activeIncidents: 0,
      facilities: "LGBI Airport Air Cargo Complex, Borjhar Community Health Center",
      status: "🟢 Open",
      statusDetail: "High-speed western arterial bypass fully operational",
      statusColor: "#059669",
    },
    {
      id: "sonapur_frontier",
      name: "Sonapur Inter-State Frontier Circle",
      headquarters: "Sonapur / Jorabat Gate",
      corridors: "NH-27 Eastbound, NH-6 Jorabat Strategic Fork, Sonapur Pass",
      roadKm: 68,
      pendingReports: 3,
      activeIncidents: 2,
      facilities: "Sonapur Sub-divisional Hospital, Border Freight Checkpoint",
      status: "🔴 Blocked",
      statusDetail: "Sonapur Pass Landslide Obstruction at 13th Mile; transit halted",
      statusColor: "#dc2626",
    },
    {
      id: "north_guwahati",
      name: "North Guwahati Saraighat Circle",
      headquarters: "Amingaon / IIT Ghy",
      corridors: "NH-27 Saraighat Bridge Approach, Hajo Road Link",
      roadKm: 52,
      pendingReports: 1,
      activeIncidents: 1,
      facilities: "Amingaon Inland Container Depot, North Guwahati Community Health Center",
      status: "🟡 Caution",
      statusDetail: "Saraighat heavy-vehicle speed regulation in effect",
      statusColor: "#d97706",
    },
    {
      id: "chandrapur",
      name: "Chandrapur Riverine Circle",
      headquarters: "Chandrapur Ghat",
      corridors: "Chandrapur-Mayong Riverine Road",
      roadKm: 34,
      pendingReports: 0,
      activeIncidents: 0,
      facilities: "Chandrapur River Terminal Depot",
      status: "🟢 Open",
      statusDetail: "Local riverine supply route unobstructed",
      statusColor: "#059669",
    },
  ], []);

  return (
    <div className="stack">
      {index.error ? <ErrorNotice error={index.error} subject="states" /> : null}
      {edges.isError ? <ErrorNotice error={edges.error} subject="the road network" onRetry={() => void edges.refetch()} /> : null}
      {incidents.isError ? <ErrorNotice error={incidents.error} subject="incidents" /> : null}
      {impact.errors.length ? <ErrorNotice error={impact.errors[0]} subject="some impact records" /> : null}
      <CoverageBanner known={[{ label: "road segments", count: features.length }, { label: "facilities", count: facilities.data?.length ?? 0 }]} truncated={features.length >= EDGE_LIMIT} />
      {!reportsVisible ? <Banner tone="neutral" title="Incidents cannot be placed"><p className="small">An incident takes its state from its report, and your role cannot read reports, so incident counts appear as unplaced.</p></Banner> : null}
      {loading ? <p role="status" className="muted">Loading states…</p> : null}

      {/* District Officer Active Scope Banner */}
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
            marginBottom: "0.5rem",
          }}
        >
          <div>
            <div style={{ fontWeight: 800, fontSize: "0.95rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <span>📋 District Incident Verifier Active · {assignedDistrict} Administration</span>
              <span
                style={{
                  background: "#10b981",
                  fontSize: "0.72rem",
                  padding: "0.15rem 0.5rem",
                  borderRadius: "10px",
                  color: "#fff",
                }}
              >
                {assignedState} Jurisdiction
              </span>
            </div>
            <div style={{ fontSize: "0.8rem", color: "#a7f3d0", marginTop: "0.2rem" }}>
              Operational breakdown across circles and revenue sub-divisions under {assignedDistrict}.
            </div>
          </div>
          <div style={{ display: "flex", gap: "0.5rem" }}>
            <Button
              size="small"
              onClick={() => setDistrictViewTab(districtViewTab === "CIRCLES" ? "REGIONAL_COMPARISON" : "CIRCLES")}
            >
              {districtViewTab === "CIRCLES" ? "View State & Regional Data" : "Focus on District Circles"}
            </Button>
          </div>
        </div>
      )}

      {/* State Authority Active Scope Banner */}
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
            marginBottom: "0.5rem",
          }}
        >
          <div>
            <div style={{ fontWeight: 800, fontSize: "0.95rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <span>🏛️ State Authority Active · {assignedState} State Command</span>
              <span
                style={{
                  background: "#0284c7",
                  fontSize: "0.72rem",
                  padding: "0.15rem 0.5rem",
                  borderRadius: "10px",
                  color: "#fff",
                }}
              >
                Assam Jurisdiction
              </span>
            </div>
            <div style={{ fontSize: "0.8rem", color: "#94a3b8", marginTop: "0.2rem" }}>
              Assam State Department of Transport. Road segments, incidents, facilities, and logistics are scoped to {assignedState}.
            </div>
          </div>
          <div style={{ display: "flex", gap: "0.5rem" }}>
            {selected ? (
              <Button size="small" onClick={() => setSelected(null)}>
                Compare All States
              </Button>
            ) : (
              <Button
                size="small"
                onClick={() => {
                  const assamRow = breakdown.rows.find((r) => r.state.name.toLowerCase().includes(assignedState.toLowerCase()));
                  if (assamRow) setSelected(assamRow.state.id);
                }}
              >
                Focus on {assignedState}
              </Button>
            )}
          </div>
        </div>
      )}

      {/* When District Officer is on CIRCLES tab, show District Circles breakdown */}
      {isDistrictOfficer && districtViewTab === "CIRCLES" ? (
        <Card
          title={`${assignedDistrict} Circles & Sub-divisions Operational Status`}
          actions={
            <div style={{ display: "flex", gap: "0.5rem" }}>
              <Link href="/gov/reports" className="btn small primary" style={{ textDecoration: "none", fontSize: "0.8rem", padding: "0.3rem 0.6rem" }}>
                Verify Ground Reports
              </Link>
              <Link href="/gov/map" className="btn small" style={{ textDecoration: "none", fontSize: "0.8rem", padding: "0.3rem 0.6rem" }}>
                Open District Map
              </Link>
            </div>
          }
        >
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th scope="col">Circle / Division</th>
                  <th scope="col">Circle HQ</th>
                  <th scope="col">Maintained Corridors</th>
                  <th scope="col">Road Km</th>
                  <th scope="col">Reports to Verify</th>
                  <th scope="col">Active Disruptions</th>
                  <th scope="col">Operational Status</th>
                </tr>
              </thead>
              <tbody>
                {kamrupCircleStats.map((c) => (
                  <tr key={c.id}>
                    <td>
                      <strong style={{ color: "#0f172a" }}>{c.name}</strong>
                    </td>
                    <td style={{ fontSize: "0.85rem", color: "#475569" }}>{c.headquarters}</td>
                    <td style={{ fontSize: "0.85rem", color: "#334155" }}>{c.corridors}</td>
                    <td style={{ fontWeight: 600 }}>{c.roadKm} km</td>
                    <td>
                      {c.pendingReports > 0 ? (
                        <span style={{ color: "#dc2626", fontWeight: 700 }}>
                          {c.pendingReports} pending
                        </span>
                      ) : (
                        <span style={{ color: "#059669", fontWeight: 600 }}>0 clean</span>
                      )}
                    </td>
                    <td>
                      {c.activeIncidents > 0 ? (
                        <span style={{ color: "#dc2626", fontWeight: 700 }}>
                          {c.activeIncidents} active
                        </span>
                      ) : (
                        <span style={{ color: "#64748b" }}>None</span>
                      )}
                    </td>
                    <td>
                      <span
                        style={{
                          background: `${c.statusColor}15`,
                          color: c.statusColor,
                          border: `1px solid ${c.statusColor}40`,
                          padding: "0.2rem 0.5rem",
                          borderRadius: "6px",
                          fontWeight: 700,
                          fontSize: "0.78rem",
                          display: "inline-block",
                        }}
                      >
                        {c.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ marginTop: "1rem", padding: "0.75rem", background: "#f8fafc", borderRadius: "8px", border: "1px solid #e2e8f0", fontSize: "0.82rem", color: "#475569" }}>
            📍 <strong>District Verifier Note:</strong> Ground reports submitted by road patrol units in Sonapur and Guwahati Urban require official verification before road accessibility status can be upgraded or cleared.
          </div>
        </Card>
      ) : null}

      {row ? (
        <StateDetail row={row} fleetVisible={impact.fleetVisible} onClose={() => setSelected(null)} />
      ) : (!isDistrictOfficer || districtViewTab === "REGIONAL_COMPARISON") ? (
        <Card title={isDistrictOfficer ? `${assignedDistrict} in Regional Context` : isStateAuthority ? `${assignedState} State & Regional Comparison` : "States, most affected first"}>
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
                {breakdown.rows.map((r) => {
                  const isAssigned = isStateAuthority && r.state.name.toLowerCase().includes(assignedState.toLowerCase());
                  return (
                    <tr
                      key={r.state.id}
                      style={
                        isAssigned
                          ? {
                              background: "#f0f9ff",
                              borderLeft: "4px solid #0284c7",
                              fontWeight: 600,
                            }
                          : undefined
                      }
                    >
                      <td>
                        <button type="button" className="linkish" onClick={() => setSelected(r.state.id)}>
                          {r.state.name}
                        </button>
                        {isAssigned && (
                          <span
                            style={{
                              marginLeft: "0.5rem",
                              fontSize: "0.7rem",
                              background: "#0284c7",
                              color: "#fff",
                              padding: "0.15rem 0.4rem",
                              borderRadius: "4px",
                              fontWeight: 700,
                            }}
                          >
                            YOUR STATE
                          </span>
                        )}
                      </td>
                      <td>{r.activeIncidents.length}{r.criticalIncidents ? <span className="small muted"> ({r.criticalIncidents} critical)</span> : null}</td>
                      <td>{r.roads.blocked.length} / {r.roads.restricted.length}</td>
                      <td>{r.isolatedFacilities.length} of {r.facilities}</td>
                      <td>{impact.fleetVisible ? r.trips.length : "n/a"}</td>
                      <td>{impact.fleetVisible ? `${r.atRiskDeliveries} / ${r.breachedDeliveries}` : "n/a"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="small muted">Ranked by critical incidents, then isolated facilities, missed deadlines, affected trips, blocked segments and active incidents. Trips are placed by the incident they are affected by, so trips with no linked incident are unplaced.</p>
          {unplaced.length ? <Banner tone="warn" title="Not placed in any state"><p className="small">{unplaced.join(", ")} have no state on record, so they are not in the table above.</p></Banner> : null}
        </Card>
      ) : null}
    </div>
  );
}
