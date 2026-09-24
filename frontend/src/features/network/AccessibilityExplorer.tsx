"use client";

import { useMemo, useState } from "react";
import { humanize } from "@/shared/lib/format";
import { formatDistance, type BBox } from "@/shared/lib/geo";
import { MapLegend, MapView, type MapPoint, type Viewport } from "@/shared/map";
import { Banner, Card, CoverageBanner, ErrorNotice, Stat, StatusBadge } from "@/shared/ui";
import { useRiskZones } from "@/features/hazard";
import { edgeLabel, edgeLines, sortBySeverity, summarizeEdges } from "./edges";
import { EdgePanel, FacilityPanel } from "./panels";
import { EDGE_LIMIT, useEdges, useFacilities } from "./queries";

type Filter = "attention" | "all";

interface Props {
  /** Optional map height; the same items are always listed beside the map. */
  height?: number;
  showSummary?: boolean;
  /** When set, a "Plan a route to here" link appears on the facility detail panel. */
  routeBase?: string;
}

export function AccessibilityExplorer({ height = 520, showSummary = true, routeBase }: Props) {
  const [viewport, setViewport] = useState<Viewport | null>(null);
  const [selectedEdge, setSelectedEdge] = useState<string | null>(null);
  const [selectedFacility, setSelectedFacility] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("attention");
  const [search, setSearch] = useState("");
  const [mapError, setMapError] = useState<string | null>(null);

  const edges = useEdges((viewport?.bbox as BBox | undefined) ?? null, viewport?.zoom ?? null);
  const facilities = useFacilities();
  const hazard = useRiskZones((viewport?.bbox as BBox | undefined) ?? null);

  const features = useMemo(() => edges.data?.features ?? [], [edges.data]);
  const summary = useMemo(() => summarizeEdges(features), [features]);
  const lines = useMemo(() => edgeLines(features), [features]);
  const points = useMemo<MapPoint[]>(
    () =>
      (facilities.data ?? []).map((f) => ({
        id: `facility:${f.id}`,
        kind: "facility",
        lon: f.lon,
        lat: f.lat,
        label: `${f.name}, ${humanize(f.kind)}${f.is_critical ? ", critical" : ""}`,
        tone: f.is_critical ? "danger" : "info",
      })),
    [facilities.data],
  );

  const listed = useMemo(() => {
    const q = search.trim().toLowerCase();
    return sortBySeverity(features)
      .filter((f) => (filter === "attention" ? f.props.accessibility_status !== "OPEN" : true))
      .filter((f) => (q ? edgeLabel(f).toLowerCase().includes(q) : true))
      .slice(0, 100);
  }, [features, filter, search]);

  const facility = facilities.data?.find((f) => selectedFacility === f.id) ?? null;
  const truncated = features.length >= EDGE_LIMIT;

  return (
    <div className="stack">
      {showSummary ? (
        <div className="grid cols-4">
          <Card><Stat label="Blocked segments" value={summary.byStatus.BLOCKED} /></Card>
          <Card><Stat label="Restricted segments" value={summary.byStatus.RESTRICTED} /></Card>
          <Card><Stat label="Caution / unknown" value={summary.byStatus.PROVISIONAL_CAUTION + summary.byStatus.UNKNOWN} hint="Not verified open" /></Card>
          <Card>
            <Stat
              label="Verified open (by length)"
              value={summary.openLengthShare === null ? "—" : `${Math.round(summary.openLengthShare * 100)}%`}
              hint={`of ${summary.total} segments loaded in this view`}
            />
          </Card>
        </div>
      ) : null}

      <CoverageBanner known={[{ label: "road segments", count: summary.total }, { label: "facilities", count: facilities.data?.length ?? 0 }]} truncated={truncated} />
      {edges.isError ? <ErrorNotice error={edges.error} subject="road network" onRetry={() => void edges.refetch()} /> : null}
      {facilities.isError ? <ErrorNotice error={facilities.error} subject="facilities" onRetry={() => void facilities.refetch()} /> : null}
      {hazard.isError ? <ErrorNotice error={hazard.error} subject="landslide risk zones" onRetry={() => void hazard.refetch()} /> : null}
      {mapError ? <Banner tone="warn" title="Map problem"><p className="small">{mapError}. The list below still shows every loaded segment.</p></Banner> : null}

      <div className="split">
        <div className="stack">
          <MapView
            ariaLabel="Road accessibility map"
            lines={lines}
            points={points}
            hazardZones={hazard.data?.zones ?? []}
            selectedId={selectedEdge ?? (selectedFacility ? `facility:${selectedFacility}` : null)}
            height={height}
            onViewportChange={setViewport}
            onSelectLine={(id) => { setSelectedEdge(id); setSelectedFacility(null); }}
            onSelectPoint={(id) => { setSelectedFacility(id.replace("facility:", "")); setSelectedEdge(null); }}
            onError={setMapError}
          />
          <MapLegend lines={lines} points={points} hazardZones={hazard.data?.zones ?? []} />
          <Card title="Road segments in view" actions={
            <div className="row">
              <label className="small" htmlFor="seg-filter">Show</label>
              <select id="seg-filter" value={filter} onChange={(e) => setFilter(e.target.value as Filter)} style={{ width: "auto" }}>
                <option value="attention">Needs attention (not verified open)</option>
                <option value="all">All segments</option>
              </select>
              <label className="sr-only" htmlFor="seg-search">Search segments by name</label>
              <input id="seg-search" placeholder="Search by name" value={search} onChange={(e) => setSearch(e.target.value)} style={{ width: "12rem" }} />
            </div>
          }>
            {edges.isPending ? <p role="status" className="muted">Loading road network…</p> : null}
            {!edges.isPending && listed.length === 0 ? (
              <p className="muted">{features.length === 0 ? "No road segments are imported for this area. That is missing coverage, not confirmation that roads are open." : "Nothing matches this filter."}</p>
            ) : null}
            {listed.length ? (
              <div className="table-wrap">
                <table>
                  <caption className="sr-only">Road segments in the current map view, most disruptive first</caption>
                  <thead><tr><th scope="col">Segment</th><th scope="col">Status</th><th scope="col">Length</th><th scope="col">Freshness</th></tr></thead>
                  <tbody>
                    {listed.map((f) => (
                      <tr key={f.id} aria-selected={selectedEdge === f.id}>
                        <td><button type="button" className="linkish" onClick={() => { setSelectedEdge(f.id); setSelectedFacility(null); }}>{edgeLabel(f)}</button></td>
                        <td><StatusBadge kind="access" value={f.props.accessibility_status} /></td>
                        <td>{formatDistance(f.props.length_meters)}</td>
                        <td>{humanize(f.props.freshness)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
          </Card>
        </div>
        <div className="stack" id="map-detail-panel">
          {selectedEdge ? <EdgePanel edgeId={selectedEdge} onClose={() => setSelectedEdge(null)} /> : null}
          {facility ? <FacilityPanel facility={facility} onClose={() => setSelectedFacility(null)} routeBase={routeBase} /> : null}
          {!selectedEdge && !facility ? (
            <Card title="Details">
              <p className="muted">Select a road segment or facility on the map or in the list to see its status, restrictions and impacts.</p>
              <h3>Facilities</h3>
              {facilities.data?.length ? (
                <ul style={{ paddingLeft: "1.1rem", margin: 0 }}>
                  {facilities.data.slice(0, 40).map((f) => (
                    <li key={f.id}><button type="button" className="linkish" onClick={() => setSelectedFacility(f.id)}>{f.name}</button> <span className="small muted">{humanize(f.kind)}{f.is_critical ? " · critical" : ""}</span></li>
                  ))}
                </ul>
              ) : (
                <p className="small muted">No facilities registered in your scope.</p>
              )}
            </Card>
          ) : null}
        </div>
      </div>
    </div>
  );
}
