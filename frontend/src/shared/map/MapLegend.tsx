const ITEMS: Array<{ label: string; color: string; style?: "dashed" | "dotted" }> = [
  { label: "Open", color: "#1a7f37" },
  { label: "Restricted", color: "#c98a00", style: "dashed" },
  { label: "Blocked", color: "#b42318" },
  { label: "Caution (unverified)", color: "#d9601a", style: "dotted" },
  { label: "Unknown", color: "#6b7785", style: "dotted" },
];

const RISK_ITEMS: Array<{ label: string; color: string }> = [
  { label: "Low", color: "#1a7f37" },
  { label: "Moderate", color: "#c98a00" },
  { label: "High", color: "#d9601a" },
  { label: "Severe", color: "#b42318" },
];

/** Line style (solid/dashed/dotted) and weight repeat what color says, so the legend works without color vision. */
export function MapLegend({
  showRoutes = false,
  showMarkers = false,
  showHazard = false,
}: {
  showRoutes?: boolean;
  showMarkers?: boolean;
  showHazard?: boolean;
}) {
  return (
    <div className="map-legend" aria-label="Map legend">
      {ITEMS.map((i) => (
        <span key={i.label}>
          <span className={`legend-swatch ${i.style ?? ""}`} style={{ borderTopColor: i.color }} aria-hidden="true" />
          {i.label}
        </span>
      ))}
      {showRoutes ? (
        <>
          <span><span className="legend-swatch" style={{ borderTopColor: "#0b5cad" }} aria-hidden="true" />Recommended route</span>
          <span><span className="legend-swatch dashed" style={{ borderTopColor: "#6a3fb5" }} aria-hidden="true" />Alternative</span>
        </>
      ) : null}
      {showMarkers ? <span>Markers: ◇ incident · ■ vehicle (dashed hollow = stale, not live) · ● facility · ▲ report</span> : null}
      {showHazard ? (
        <>
          {RISK_ITEMS.map((i) => (
            <span key={i.label}>
              <span className="legend-swatch" style={{ borderTopColor: i.color, borderTopWidth: 8 }} aria-hidden="true" />
              Landslide risk: {i.label}
            </span>
          ))}
          <span className="muted">High/Severe zones pulse and show animated rainfall; turned off automatically if your system prefers reduced motion.</span>
        </>
      ) : (
        <span className="muted">Blocked roads are drawn heavy with a dark outline.</span>
      )}
    </div>
  );
}
