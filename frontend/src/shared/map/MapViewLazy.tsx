"use client";

import dynamic from "next/dynamic";
import type { MapViewProps } from "./MapView";

/** Shown instead of the map when its code cannot be loaded (typically: offline and never fetched). */
function MapUnavailable({ height = 460 }: MapViewProps) {
  return (
    <div className="map-frame" style={{ height, display: "grid", placeItems: "center", padding: "1rem", textAlign: "center" }} role="status">
      <p className="muted">The map is not available without a connection. Everything else on this screen still works; use the list, GPS, milestones or coordinates instead.</p>
    </div>
  );
}

/**
 * MapLibre touches browser APIs, so it is only ever loaded on the client. If its chunk cannot be fetched,
 * the map is replaced by a notice rather than letting the whole screen fail.
 */
export const MapView = dynamic<MapViewProps>(() => import("./MapView").catch(() => ({ default: MapUnavailable })), {
  ssr: false,
  loading: () => (
    <div className="map-frame" style={{ height: 460, display: "grid", placeItems: "center" }} role="status">
      <p className="muted">Loading map… the list view is available now.</p>
    </div>
  ),
});

/** Fetch the map code ahead of time (while online) so the service worker can keep it for offline use. */
export function preloadMap(): Promise<unknown> {
  return import("./MapView").catch(() => undefined);
}
