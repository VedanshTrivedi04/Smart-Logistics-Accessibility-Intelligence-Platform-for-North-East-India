"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { formatCoords, humanize } from "@/shared/lib/format";
import { bboxOfCoordinates, formatDistance, NER_BBOX, type BBox } from "@/shared/lib/geo";
import { formatDuration } from "@/shared/lib/time";
import { MapLegend, MapView, type MapLine, type MapPoint } from "@/shared/map";
import { Banner, ErrorNotice, Field, StatusBadge } from "@/shared/ui";
import { routeCrossesHighRisk } from "@/features/hazard";
import { edgeLines } from "@/features/network";
import { AddressSearch, type GeocodeResult } from "./AddressSearch";
import { buildDirections, type DirectionStep } from "./directions";
import { DirectionsList } from "./DirectionsList";
import { lineStrings, planLines } from "./geometry";
import { usePublicEdges, usePublicHazardZones, usePublicIncidents, useEvaluatePublicRoute } from "./publicQueries";
import { RouteExplanation } from "./RoutePlanView";
import { ElevationProfile } from "./ElevationProfile";
import {
  ArrowLeftRight,
  Compass,
  MapPin,
  Navigation,
  Clock,
  ShieldCheck,
  Sparkles,
} from "lucide-react";

interface HubCity {
  id: string;
  name: string;
  state: string;
  lat: number;
  lon: number;
  corridor: string;
  altitudeM: number;
}

interface RoutePoint {
  name: string;
  state?: string;
  lat: number;
  lon: number;
  corridor?: string;
  altitudeM?: number;
}

const NER_HUBS: HubCity[] = [
  { id: "gau", name: "Guwahati", state: "Assam", lat: 26.1445, lon: 91.7362, corridor: "NH-27 / NH-6 Gateway", altitudeM: 55 },
  { id: "shl", name: "Shillong", state: "Meghalaya", lat: 25.5788, lon: 91.8933, corridor: "NH-6 Hill Spine", altitudeM: 1525 },
  { id: "slc", name: "Silchar", state: "Assam (Barak Valley)", lat: 24.817, lon: 92.7993, corridor: "NH-6 / NH-37 Connector", altitudeM: 25 },
  { id: "tez", name: "Tezpur", state: "Assam", lat: 26.6528, lon: 92.7926, corridor: "NH-15 / Kolia Bhomora Bridge", altitudeM: 48 },
  { id: "jrh", name: "Jorhat", state: "Assam", lat: 26.7509, lon: 94.2037, corridor: "NH-715 Upper Assam", altitudeM: 116 },
  { id: "dbr", name: "Dibrugarh", state: "Assam", lat: 27.4728, lon: 94.912, corridor: "NH-2 Bogibeel Bridge", altitudeM: 108 },
  { id: "azl", name: "Aizawl", state: "Mizoram", lat: 23.7271, lon: 92.7176, corridor: "NH-306 Mountain Ridge", altitudeM: 1132 },
  { id: "khm", name: "Kohima", state: "Nagaland", lat: 25.6751, lon: 94.1086, corridor: "NH-2 Hill Corridor", altitudeM: 1444 },
  { id: "imp", name: "Imphal", state: "Manipur", lat: 24.817, lon: 93.9368, corridor: "NH-29 / NH-37", altitudeM: 786 },
  { id: "agt", name: "Agartala", state: "Tripura", lat: 23.8315, lon: 91.2868, corridor: "NH-8 Southern Link", altitudeM: 16 },
];

function hubToPoint(h: HubCity): RoutePoint {
  return { name: h.name, state: h.state, lat: h.lat, lon: h.lon, corridor: h.corridor, altitudeM: h.altitudeM };
}

export function PublicRouteCheck() {
  const [originId, setOriginId] = useState<string>("gau");
  const [destId, setDestId] = useState<string>("shl");
  const [customOrigin, setCustomOrigin] = useState<RoutePoint | null>(null);
  const [customDest, setCustomDest] = useState<RoutePoint | null>(null);
  const [focusedStep, setFocusedStep] = useState<number | null>(null);

  const origin = customOrigin ?? hubToPoint(NER_HUBS.find((h) => h.id === originId) ?? (NER_HUBS[0] as HubCity));
  const dest = customDest ?? hubToPoint(NER_HUBS.find((h) => h.id === destId) ?? (NER_HUBS[1] as HubCity));

  const evaluate = useEvaluatePublicRoute();

  // Real road-following route, recomputed whenever the chosen points change. Rate-limited
  // server-side (10/min per visitor) — normal dropdown/search/swap use stays well under that.
  useEffect(() => {
    evaluate.mutate({ originLat: origin.lat, originLon: origin.lon, destinationLat: dest.lat, destinationLon: dest.lon });
    setFocusedStep(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [origin.lat, origin.lon, dest.lat, dest.lon]);

  const routeLines = useMemo<MapLine[]>(() => (evaluate.data ? planLines(evaluate.data) : []), [evaluate.data]);
  const primaryCoords = useMemo(() => (evaluate.data ? lineStrings(evaluate.data.primary_geometry).flat() : []), [evaluate.data]);
  const routeBounds = useMemo(() => {
    const routeCoords = routeLines.flatMap((l) => l.coordinates);
    if (routeCoords.length) return bboxOfCoordinates(routeCoords);
    return bboxOfCoordinates([[origin.lon, origin.lat], [dest.lon, dest.lat]]) ?? NER_BBOX;
  }, [routeLines, origin, dest]);

  const edges = usePublicEdges(routeBounds, 12, Boolean(routeBounds));
  const hazard = usePublicHazardZones(routeBounds, Boolean(routeBounds));
  const incidents = usePublicIncidents();

  // Only display disrupted or caution segments as road overlays on the route preview,
  // so open roads are cleanly displayed by the map tiles without drawing coarse synthetic lines across rivers.
  const roadLines = useMemo(() => {
    const disrupted = (edges.data?.features ?? []).filter(
      (f) => f.props.accessibility_status !== "OPEN"
    );
    return edgeLines(disrupted);
  }, [edges.data]);
  const mapLines = useMemo(() => [...roadLines, ...routeLines], [roadLines, routeLines]);
  const crossedZones = useMemo(() => routeCrossesHighRisk(primaryCoords, hazard.data?.zones ?? []), [primaryCoords, hazard.data]);
  const directions = useMemo<DirectionStep[]>(() => (evaluate.data ? buildDirections(evaluate.data) : []), [evaluate.data]);

  const focusedPoint = focusedStep !== null ? directions[focusedStep]?.at ?? null : null;
  const mapBounds: BBox | null = focusedPoint ? [focusedPoint[0] - 0.01, focusedPoint[1] - 0.01, focusedPoint[0] + 0.01, focusedPoint[1] + 0.01] : routeBounds;
  const mapFitKey = focusedPoint ? `step-${focusedStep}` : `${origin.lat},${origin.lon}-${dest.lat},${dest.lon}-${evaluate.data?.id ?? "pending"}`;

  const mapPoints = useMemo<MapPoint[]>(
    () => [
      { id: "origin", kind: "stop" as const, lon: origin.lon, lat: origin.lat, label: `${origin.name}${origin.state ? `, ${origin.state}` : ""}`, tone: "ok" as const, glyph: "A" },
      { id: "destination", kind: "stop" as const, lon: dest.lon, lat: dest.lat, label: `${dest.name}${dest.state ? `, ${dest.state}` : ""}`, tone: "danger" as const, glyph: "B" },
      ...(incidents.data ?? []).map((i) => ({
        id: `incident:${i.id}`,
        kind: "incident" as const,
        lon: i.lon,
        lat: i.lat,
        label: `${i.title} · ${humanize(i.severity)}`,
        tone: i.severity === "CRITICAL" || i.severity === "HIGH" ? ("danger" as const) : ("warn" as const),
      })),
    ],
    [origin, dest, incidents.data],
  );

  const pickOrigin = (r: GeocodeResult) => setCustomOrigin({ name: r.label, lat: r.lat, lon: r.lon });
  const pickDest = (r: GeocodeResult) => setCustomDest({ name: r.label, lat: r.lat, lon: r.lon });

  return (
    <div className="stack" style={{ gap: "1.5rem" }}>
      {/* Hero Card */}
      <div
        style={{
          padding: "1.75rem 2rem",
          borderRadius: "16px",
          background: "linear-gradient(135deg, #ffffff 0%, #f0f9ff 60%, #ecfdf5 100%)",
          border: "1px solid #bae6fd",
          boxShadow: "0 10px 25px -5px rgba(2, 132, 199, 0.08), 0 8px 10px -6px rgba(2, 132, 199, 0.04)",
          position: "relative",
          overflow: "hidden",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "0.5rem" }}>
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "0.4rem",
              background: "#ecfdf5",
              color: "#059669",
              border: "1px solid #a7f3d0",
              padding: "0.25rem 0.65rem",
              borderRadius: "9999px",
              fontSize: "0.75rem",
              fontWeight: 700,
              letterSpacing: "0.02em",
            }}
          >
            <span style={{ width: "7px", height: "7px", borderRadius: "50%", background: "#10b981", display: "inline-block", boxShadow: "0 0 0 2px rgba(16, 185, 129, 0.2)" }} />
            LIVE HIGHWAY INTELLIGENCE · NORTH EAST REGION
          </span>
        </div>
        <h2 style={{ margin: "0.25rem 0 0.5rem", fontSize: "1.6rem", fontWeight: 800, color: "#0f172a", letterSpacing: "-0.02em" }}>
          North Eastern Region Public Corridor & Highway Status
        </h2>
        <p style={{ margin: 0, color: "#475569", fontSize: "0.92rem", lineHeight: 1.5, maxWidth: "840px" }}>
          Real road-following navigation, dynamic mountain elevation profiles, active landslide hazard zones, and weather-resilient travel advisories across the Eight Sister States — computed by the same autonomous logistics engine used by government operators, with no login required.
        </p>
      </div>

      {/* Origin / Destination Picker Form */}
      <div
        style={{
          background: "#ffffff",
          borderRadius: "16px",
          border: "1px solid #e2e8f0",
          boxShadow: "0 4px 20px -2px rgba(15, 23, 42, 0.05), 0 2px 6px -1px rgba(15, 23, 42, 0.03)",
          padding: "1.5rem",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.25rem", flexWrap: "wrap", gap: "0.5rem" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <Compass size={20} color="#0284c7" />
            <h3 style={{ margin: 0, fontSize: "1.15rem", fontWeight: 700, color: "#0f172a" }}>
              Plan Your Travel Corridor
            </h3>
          </div>
          <span style={{ fontSize: "0.8rem", color: "#64748b", background: "#f8fafc", padding: "0.3rem 0.75rem", borderRadius: "9999px", border: "1px solid #e2e8f0" }}>
            Real-time NHAI & State PWD status network
          </span>
        </div>

        <div className="stack" style={{ gap: "1.25rem" }}>
          <div className="grid cols-2" style={{ gap: "1.25rem" }}>
            <Field label="Departure City / Gateway Hub" htmlFor="orig-select">
              <select
                id="orig-select"
                value={originId}
                onChange={(e) => {
                  setOriginId(e.target.value);
                  setCustomOrigin(null);
                }}
                style={{
                  width: "100%",
                  padding: "0.7rem 0.9rem",
                  borderRadius: "10px",
                  background: "#ffffff",
                  color: "#0f172a",
                  border: "1.5px solid #cbd5e1",
                  fontSize: "0.95rem",
                  fontWeight: 500,
                  boxShadow: "0 1px 2px rgba(0, 0, 0, 0.04)",
                  outline: "none",
                  cursor: "pointer",
                }}
              >
                {NER_HUBS.map((h) => (
                  <option key={h.id} value={h.id} disabled={h.id === destId && !customDest}>
                    {h.name}, {h.state} ({h.altitudeM}m alt)
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Destination City / Gateway Hub" htmlFor="dest-select">
              <select
                id="dest-select"
                value={destId}
                onChange={(e) => {
                  setDestId(e.target.value);
                  setCustomDest(null);
                }}
                style={{
                  width: "100%",
                  padding: "0.7rem 0.9rem",
                  borderRadius: "10px",
                  background: "#ffffff",
                  color: "#0f172a",
                  border: "1.5px solid #cbd5e1",
                  fontSize: "0.95rem",
                  fontWeight: 500,
                  boxShadow: "0 1px 2px rgba(0, 0, 0, 0.04)",
                  outline: "none",
                  cursor: "pointer",
                }}
              >
                {NER_HUBS.map((h) => (
                  <option key={h.id} value={h.id} disabled={h.id === originId && !customOrigin}>
                    {h.name}, {h.state} ({h.altitudeM}m alt)
                  </option>
                ))}
              </select>
            </Field>
          </div>

          <div className="grid cols-2" style={{ gap: "1.25rem" }}>
            <div>
              <AddressSearch id="pub-search-origin" label="Or search any custom origin place" onSelect={pickOrigin} />
              {customOrigin ? (
                <p className="small" style={{ marginTop: "0.35rem", color: "#64748b" }}>
                  <button type="button" className="linkish" onClick={() => setCustomOrigin(null)} style={{ color: "#0284c7", fontWeight: 600 }}>
                    Use hub dropdown instead
                  </button>{" "}
                  · Selected: <strong>{customOrigin.name}</strong>
                </p>
              ) : null}
            </div>
            <div>
              <AddressSearch id="pub-search-dest" label="Or search any custom destination place" onSelect={pickDest} />
              {customDest ? (
                <p className="small" style={{ marginTop: "0.35rem", color: "#64748b" }}>
                  <button type="button" className="linkish" onClick={() => setCustomDest(null)} style={{ color: "#0284c7", fontWeight: 600 }}>
                    Use hub dropdown instead
                  </button>{" "}
                  · Selected: <strong>{customDest.name}</strong>
                </p>
              ) : null}
            </div>
          </div>

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "0.75rem", paddingTop: "0.25rem" }}>
            <button
              type="button"
              onClick={() => {
                const tempId = originId;
                const tempCustom = customOrigin;
                setOriginId(destId);
                setCustomOrigin(customDest);
                setDestId(tempId);
                setCustomDest(tempCustom);
              }}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "0.5rem",
                padding: "0.55rem 1rem",
                borderRadius: "8px",
                background: "#f1f5f9",
                border: "1px solid #cbd5e1",
                color: "#1e293b",
                fontSize: "0.85rem",
                fontWeight: 600,
                cursor: "pointer",
                transition: "all 0.15s ease",
              }}
            >
              <ArrowLeftRight size={15} color="#0284c7" />
              Swap Origin & Destination
            </button>
            <span style={{ fontSize: "0.8rem", color: "#64748b" }}>
              ⚡ Routed dynamically via live road-status network
            </span>
          </div>
        </div>
      </div>

      {/* Map Card */}
      <div
        style={{
          background: "#ffffff",
          borderRadius: "16px",
          border: "1px solid #e2e8f0",
          boxShadow: "0 4px 20px -2px rgba(15, 23, 42, 0.05), 0 2px 6px -1px rgba(15, 23, 42, 0.03)",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            padding: "1rem 1.4rem",
            borderBottom: "1px solid #e2e8f0",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: "0.5rem",
            background: "#ffffff",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <MapPin size={18} color="#0284c7" />
            <h3 style={{ margin: 0, fontSize: "1.1rem", fontWeight: 700, color: "#0f172a" }}>
              Corridor Satellite & Terrain Map: {origin.name} → {dest.name}
            </h3>
          </div>
          {evaluate.data && (
            <span style={{ fontSize: "0.8rem", fontWeight: 600, color: "#0284c7", background: "#f0f9ff", border: "1px solid #bae6fd", padding: "0.2rem 0.65rem", borderRadius: "9999px" }}>
              {formatDistance(evaluate.data.total_distance_meters)} · {formatDuration(evaluate.data.total_duration_seconds)}
            </span>
          )}
        </div>
        <div style={{ padding: "0.5rem" }}>
          <MapView
            ariaLabel={`Route between ${origin.name} and ${dest.name}, with landslide risk zones and active incidents`}
            points={mapPoints}
            lines={mapLines}
            hazardZones={hazard.data?.zones ?? []}
            fitBounds={mapBounds}
            fitKey={mapFitKey}
            height={380}
          />
          <div style={{ padding: "0.5rem 0.75rem" }}>
            <MapLegend points={mapPoints} lines={mapLines} hazardZones={hazard.data?.zones ?? []} />
          </div>
        </div>
        {evaluate.isPending ? (
          <p className="small muted" style={{ margin: "0.5rem 1rem", color: "#64748b" }}>
            Computing the real road route…
          </p>
        ) : null}
        {evaluate.isError ? (
          <div style={{ padding: "1rem" }}>
            <ErrorNotice
              error={evaluate.error}
              subject="this route"
              onRetry={() => evaluate.mutate({ originLat: origin.lat, originLon: origin.lon, destinationLat: dest.lat, destinationLon: dest.lon })}
            />
          </div>
        ) : null}
      </div>

      {/* Results and Visualizations */}
      {evaluate.data ? (
        <>
          <div className="row" style={{ alignItems: "center", gap: "0.75rem", flexWrap: "wrap" }}>
            <StatusBadge kind="route" value={evaluate.data.result_status} />
            {evaluate.data.graph_version?.includes("pilot") ? (
              <span
                style={{
                  background: "#e0f2fe",
                  color: "#0369a1",
                  border: "1px solid #bae6fd",
                  padding: "0.25rem 0.75rem",
                  borderRadius: "9999px",
                  fontSize: "0.78rem",
                  fontWeight: 600,
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "0.35rem",
                }}
              >
                <Sparkles size={13} />
                Active Sensor Pilot Corridor (NH-6 / NH-27)
              </span>
            ) : (
              <span
                style={{
                  background: "#f3e8ff",
                  color: "#6b21a8",
                  border: "1px solid #e9d5ff",
                  padding: "0.25rem 0.75rem",
                  borderRadius: "9999px",
                  fontSize: "0.78rem",
                  fontWeight: 600,
                }}
              >
                Regional NER Highway Network
              </span>
            )}
          </div>

          {evaluate.data.result_status === "FEASIBLE" ? (
            <>
              {/* Executive Metrics Grid */}
              <div className="grid cols-3" style={{ gap: "1rem" }}>
                <div
                  style={{
                    background: "#ffffff",
                    borderRadius: "14px",
                    padding: "1.25rem",
                    border: "1px solid #e2e8f0",
                    boxShadow: "0 2px 10px rgba(0,0,0,0.03)",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.4rem" }}>
                    <span style={{ fontSize: "0.8rem", fontWeight: 600, color: "#64748b" }}>Road Distance</span>
                    <Navigation size={18} color="#0284c7" />
                  </div>
                  <div style={{ fontSize: "1.75rem", fontWeight: 800, color: "#0284c7" }}>
                    {formatDistance(evaluate.data.total_distance_meters)}
                  </div>
                  <p style={{ margin: "0.25rem 0 0", fontSize: "0.78rem", color: "#64748b" }}>
                    Actual road-following distance across mountain highway contours.
                  </p>
                </div>

                <div
                  style={{
                    background: "#ffffff",
                    borderRadius: "14px",
                    padding: "1.25rem",
                    border: "1px solid #e2e8f0",
                    boxShadow: "0 2px 10px rgba(0,0,0,0.03)",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.4rem" }}>
                    <span style={{ fontSize: "0.8rem", fontWeight: 600, color: "#64748b" }}>Estimated Transit Time</span>
                    <Clock size={18} color="#7c3aed" />
                  </div>
                  <div style={{ fontSize: "1.75rem", fontWeight: 800, color: "#7c3aed" }}>
                    {formatDuration(evaluate.data.total_duration_seconds)}
                  </div>
                  <p style={{ margin: "0.25rem 0 0", fontSize: "0.78rem", color: "#64748b" }}>
                    Computed based on hill terrain speed and live road status.
                  </p>
                </div>

                <div
                  style={{
                    background: "#ffffff",
                    borderRadius: "14px",
                    padding: "1.25rem",
                    border: "1px solid #e2e8f0",
                    boxShadow: "0 2px 10px rgba(0,0,0,0.03)",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.4rem" }}>
                    <span style={{ fontSize: "0.8rem", fontWeight: 600, color: "#64748b" }}>Corridor Alternatives</span>
                    <ShieldCheck size={18} color="#059669" />
                  </div>
                  <div style={{ fontSize: "1.75rem", fontWeight: 800, color: "#059669" }}>
                    {evaluate.data.alternatives.length} Detour{evaluate.data.alternatives.length === 1 ? "" : "s"}
                  </div>
                  <p style={{ margin: "0.25rem 0 0", fontSize: "0.78rem", color: "#64748b" }}>
                    {evaluate.data.alternatives.length ? "Alternative viable routes shown in purple." : "Direct primary highway corridor active."}
                  </p>
                </div>
              </div>

              {/* DATA VISUALIZATION: Terrain Elevation & Incline Mountain Profile */}
              <ElevationProfile
                originName={origin.name}
                originAlt={origin.altitudeM ?? 60}
                destName={dest.name}
                destAlt={dest.altitudeM ?? 100}
                distanceMeters={evaluate.data.total_distance_meters}
                durationSeconds={evaluate.data.total_duration_seconds}
                hazardCount={crossedZones.length}
                hasPilotSensors={Boolean(evaluate.data.graph_version?.includes("pilot"))}
              />
            </>
          ) : null}

          {crossedZones.length > 0 ? (
            <Banner tone="warn" title={`Route crosses ${crossedZones.length} landslide risk zone${crossedZones.length === 1 ? "" : "s"}`}>
              <p className="small">
                {crossedZones.map((z) => z.name ?? "Unnamed zone").join(", ")} — rated {crossedZones.some((z) => z.riskLevel === "SEVERE") ? "SEVERE" : "HIGH"}. Check rainfall conditions before departure, especially during an active monsoon spell.
              </p>
            </Banner>
          ) : null}

          {evaluate.data.result_status === "NO_FEASIBLE_PATH" ? (
            <Banner tone="danger" title="No feasible path">
              <p className="small">Every admissible road between these points is closed to a standard vehicle right now. No detour is suggested and no closed segment is used.</p>
            </Banner>
          ) : null}
          {evaluate.data.result_status === "INSUFFICIENT_DATA" ? (
            <Banner tone="caution" title="Insufficient data — road condition unknown">
              <p className="small">The network does not hold enough data (for example a bridge limit or a missing link) to give a safe answer, so none is given.</p>
            </Banner>
          ) : null}

          {evaluate.data.result_status === "FEASIBLE" ? (
            <DirectionsList steps={directions} activeIndex={focusedStep} onStepClick={(i) => setFocusedStep((cur) => (cur === i ? null : i))} />
          ) : null}

          <RouteExplanation plan={evaluate.data} />
        </>
      ) : null}

      {/* Key Checkpoints on Corridor */}
      <div
        style={{
          background: "#ffffff",
          borderRadius: "16px",
          border: "1px solid #e2e8f0",
          boxShadow: "0 4px 20px -2px rgba(15, 23, 42, 0.05), 0 2px 6px -1px rgba(15, 23, 42, 0.03)",
          padding: "1.25rem 1.5rem",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "1rem" }}>
          <Compass size={18} color="#0284c7" />
          <h3 style={{ margin: 0, fontSize: "1.1rem", fontWeight: 700, color: "#0f172a" }}>
            Corridor Hub Profiles & Elevations
          </h3>
        </div>
        <div className="grid cols-2" style={{ gap: "1rem" }}>
          <div style={{ padding: "1rem 1.25rem", background: "#f8fafc", borderRadius: "12px", border: "1px solid #e2e8f0" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.25rem" }}>
              <strong style={{ color: "#0284c7", fontSize: "0.95rem" }}>Departure Hub: {origin.name}</strong>
              {origin.altitudeM !== undefined ? (
                <span style={{ background: "#e0f2fe", color: "#0369a1", padding: "0.15rem 0.5rem", borderRadius: "9999px", fontSize: "0.72rem", fontWeight: 700 }}>
                  {origin.altitudeM} m MSL
                </span>
              ) : null}
            </div>
            <p style={{ margin: "0.25rem 0", fontSize: "0.8rem", color: "#64748b" }}>
              Coordinates: {formatCoords(origin.lat, origin.lon)}
            </p>
            {origin.corridor ? (
              <div style={{ fontSize: "0.8rem", color: "#334155", fontWeight: 500, marginTop: "0.35rem" }}>
                Primary Highway: <span style={{ color: "#0f172a", fontWeight: 600 }}>{origin.corridor}</span>
              </div>
            ) : null}
          </div>

          <div style={{ padding: "1rem 1.25rem", background: "#f8fafc", borderRadius: "12px", border: "1px solid #e2e8f0" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.25rem" }}>
              <strong style={{ color: "#7c3aed", fontSize: "0.95rem" }}>Destination Hub: {dest.name}</strong>
              {dest.altitudeM !== undefined ? (
                <span style={{ background: "#f3e8ff", color: "#6b21a8", padding: "0.15rem 0.5rem", borderRadius: "9999px", fontSize: "0.72rem", fontWeight: 700 }}>
                  {dest.altitudeM} m MSL
                </span>
              ) : null}
            </div>
            <p style={{ margin: "0.25rem 0", fontSize: "0.8rem", color: "#64748b" }}>
              Coordinates: {formatCoords(dest.lat, dest.lon)}
            </p>
            {dest.corridor ? (
              <div style={{ fontSize: "0.8rem", color: "#334155", fontWeight: 500, marginTop: "0.35rem" }}>
                Primary Highway: <span style={{ color: "#0f172a", fontWeight: 600 }}>{dest.corridor}</span>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {/* Citizen Travel Advisory Notes */}
      <div
        style={{
          background: "#ffffff",
          borderRadius: "16px",
          border: "1px solid #e2e8f0",
          boxShadow: "0 4px 20px -2px rgba(15, 23, 42, 0.05), 0 2px 6px -1px rgba(15, 23, 42, 0.03)",
          padding: "1.25rem 1.5rem",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.85rem" }}>
          <ShieldCheck size={18} color="#059669" />
          <h3 style={{ margin: 0, fontSize: "1.1rem", fontWeight: 700, color: "#0f172a" }}>
            Monsoon & Hill Highway Safe Driving Guidelines
          </h3>
        </div>
        <div style={{ display: "grid", gap: "0.6rem" }}>
          <div style={{ display: "flex", gap: "0.6rem", alignItems: "flex-start", fontSize: "0.85rem", color: "#334155" }}>
            <span style={{ color: "#059669", fontWeight: 700 }}>✓</span>
            <span><strong>Fuel & Range Check:</strong> Always verify fuel levels before starting steep hill ascents; refueling stations are sparse in gorge sectors.</span>
          </div>
          <div style={{ display: "flex", gap: "0.6rem", alignItems: "flex-start", fontSize: "0.85rem", color: "#334155" }}>
            <span style={{ color: "#059669", fontWeight: 700 }}>✓</span>
            <span><strong>Hairpin Bend Caution:</strong> Maintain a minimum 3-second safe following distance on hairpin turns along NH-6, NH-306, and NH-2; heavy multi-axle trucks require full road width.</span>
          </div>
          <div style={{ display: "flex", gap: "0.6rem", alignItems: "flex-start", fontSize: "0.85rem", color: "#334155" }}>
            <span style={{ color: "#059669", fontWeight: 700 }}>✓</span>
            <span><strong>Monsoon Night Driving:</strong> During active monsoon rain warnings, avoid night travel across landslide-prone mountain slopes between Umling and Nongpoh.</span>
          </div>
          <div style={{ display: "flex", gap: "0.6rem", alignItems: "flex-start", fontSize: "0.85rem", color: "#334155" }}>
            <span style={{ color: "#059669", fontWeight: 700 }}>✓</span>
            <span><strong>Hazard Reporting:</strong> Report any unverified road blockages, mudslides, or fallen trees to local district disaster management authorities or via the PARVA Field app.</span>
          </div>
        </div>
      </div>

      {/* Official Sign In Links */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "1.25rem 1.75rem",
          borderRadius: "14px",
          background: "linear-gradient(135deg, #f8fafc 0%, #edf2f7 100%)",
          border: "1px solid #cbd5e1",
          boxShadow: "0 2px 8px rgba(0, 0, 0, 0.03)",
          flexWrap: "wrap",
          gap: "1rem",
        }}
      >
        <div>
          <strong style={{ color: "#0f172a", fontSize: "0.95rem" }}>
            Authorized Personnel & Logistics Dispatchers:
          </strong>
          <p style={{ margin: "0.25rem 0 0", color: "#64748b", fontSize: "0.83rem" }}>
            Sign in to access real-time telemetry, fleet tracking, road closures, and AI reroute engines.
          </p>
        </div>
        <Link
          href="/login"
          style={{
            background: "linear-gradient(135deg, #0284c7 0%, #0369a1 100%)",
            color: "#ffffff",
            padding: "0.55rem 1.25rem",
            borderRadius: "8px",
            fontSize: "0.85rem",
            fontWeight: 600,
            textDecoration: "none",
            boxShadow: "0 2px 6px rgba(2, 132, 199, 0.25)",
            display: "inline-flex",
            alignItems: "center",
            gap: "0.4rem",
          }}
        >
          Authorized Login →
        </Link>
      </div>
    </div>
  );
}
