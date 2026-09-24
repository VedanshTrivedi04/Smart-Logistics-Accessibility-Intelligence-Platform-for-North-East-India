"use client";

import dynamic from "next/dynamic";
import type { MapViewProps } from "./MapView";

/** MapLibre touches browser APIs, so it is only ever loaded on the client. */
export const MapView = dynamic<MapViewProps>(() => import("./MapView"), {
  ssr: false,
  loading: () => (
    <div className="map-frame" style={{ height: 460, display: "grid", placeItems: "center" }} role="status">
      <p className="muted">Loading map… the list view is available now.</p>
    </div>
  ),
});
