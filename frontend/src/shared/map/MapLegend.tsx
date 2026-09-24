import type { HazardZone, LineClass, MapLine } from "./MapView";
import type { MapPoint } from "./cluster";

const ROAD_STATUS_ITEMS: Array<{ cls: LineClass; label: string; color: string; style?: "dashed" | "dotted" }> = [
  { cls: "open", label: "Open", color: "#1a7f37" },
  { cls: "restricted", label: "Restricted", color: "#c98a00", style: "dashed" },
  { cls: "blocked", label: "Blocked", color: "#b42318" },
  { cls: "caution", label: "Caution (unverified)", color: "#d9601a", style: "dotted" },
  { cls: "unknown", label: "Unknown", color: "#6b7785", style: "dotted" },
];

const RISK_ITEMS: Array<{ label: string; color: string }> = [
  { label: "Low", color: "#1a7f37" },
  { label: "Moderate", color: "#c98a00" },
  { label: "High", color: "#d9601a" },
  { label: "Severe", color: "#b42318" },
];

const MARKER_DESCRIPTIONS: Record<MapPoint["kind"], string> = {
  incident: "◇ incident",
  vehicle: "■ vehicle (dashed hollow = stale, not live)",
  facility: "● facility",
  report: "▲ report",
  self: "● your location",
  stop: "● waypoint (a letter or number is shown on the pin)",
};

/**
 * Derives what to show entirely from the same `lines`/`points`/`hazardZones` handed
 * to the MapView beside it, so the legend can never claim a symbol is in play that
 * this particular map never actually draws (it used to be a fixed, hand-picked list
 * of booleans per page, which drifted out of sync with what each page really shows).
 */
export function MapLegend({
  lines = [],
  points = [],
  hazardZones = [],
}: {
  lines?: readonly MapLine[];
  points?: readonly MapPoint[];
  hazardZones?: readonly HazardZone[];
}) {
  const classes = new Set(lines.map((l) => l.cls));
  const roadStatusItems = ROAD_STATUS_ITEMS.filter((i) => classes.has(i.cls));
  const hasRoutePrimary = classes.has("route_primary");
  const hasRouteAlt = classes.has("route_alt");
  const hasTrail = classes.has("trail");
  const kinds = [...new Set(points.map((p) => p.kind))];
  const hasHazard = hazardZones.length > 0;

  if (roadStatusItems.length === 0 && !hasRoutePrimary && !hasRouteAlt && !hasTrail && kinds.length === 0 && !hasHazard) {
    return null;
  }

  return (
    <div className="map-legend" aria-label="Map legend">
      {roadStatusItems.map((i) => (
        <span key={i.label}>
          <span className={`legend-swatch ${i.style ?? ""}`} style={{ borderTopColor: i.color }} aria-hidden="true" />
          {i.label}
        </span>
      ))}
      {hasRoutePrimary ? (
        <span><span className="legend-swatch" style={{ borderTopColor: "#0b5cad" }} aria-hidden="true" />Recommended route</span>
      ) : null}
      {hasRouteAlt ? (
        <span><span className="legend-swatch dashed" style={{ borderTopColor: "#6a3fb5" }} aria-hidden="true" />Alternative</span>
      ) : null}
      {hasTrail ? (
        <span><span className="legend-swatch dotted" style={{ borderTopColor: "#0e7490" }} aria-hidden="true" />GPS trail</span>
      ) : null}
      {kinds.length ? <span>Markers: {kinds.map((k) => MARKER_DESCRIPTIONS[k]).join(" · ")}</span> : null}
      {hasHazard ? (
        <>
          {RISK_ITEMS.map((i) => (
            <span key={i.label}>
              <span className="legend-swatch" style={{ borderTopColor: i.color, borderTopWidth: 8 }} aria-hidden="true" />
              Landslide risk: {i.label}
            </span>
          ))}
          <span className="muted">High/Severe zones pulse and show animated rainfall; turned off automatically if your system prefers reduced motion.</span>
        </>
      ) : null}
      {roadStatusItems.some((i) => i.cls === "blocked") ? <span className="muted">Blocked roads are drawn heavy with a dark outline.</span> : null}
    </div>
  );
}
