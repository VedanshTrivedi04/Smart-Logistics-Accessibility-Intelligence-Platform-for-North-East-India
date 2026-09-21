"use client";

import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useRef, useState } from "react";
import { NER_BBOX, type BBox } from "@/shared/lib/geo";
import { clusterPoints, isCluster, type MapPoint } from "./cluster";

export type LineClass = "open" | "restricted" | "blocked" | "caution" | "unknown" | "route_primary" | "route_alt" | "trail";

export interface MapLine {
  id: string;
  cls: LineClass;
  coordinates: Array<[number, number]>;
}

export interface Viewport {
  bbox: BBox;
  zoom: number;
}

export interface MapViewProps {
  ariaLabel: string;
  lines?: readonly MapLine[];
  points?: readonly MapPoint[];
  selectedId?: string | null;
  onSelectLine?: (id: string) => void;
  onSelectPoint?: (id: string) => void;
  onViewportChange?: (viewport: Viewport) => void;
  /** Called with lon/lat when the user clicks empty map (used for manual location picks). */
  onMapClick?: (lon: number, lat: number) => void;
  /** Fit the map to these bounds whenever `fitKey` changes. */
  fitBounds?: BBox | null;
  fitKey?: string;
  height?: number | string;
  onError?: (message: string) => void;
}

const LINE_PAINT: Record<LineClass, { color: string; width: number; dash?: number[]; casing?: boolean }> = {
  open: { color: "#1a7f37", width: 2.5 },
  restricted: { color: "#c98a00", width: 4, dash: [3, 2] },
  blocked: { color: "#b42318", width: 5, casing: true },
  caution: { color: "#d9601a", width: 4, dash: [1, 2] },
  unknown: { color: "#6b7785", width: 3, dash: [0.5, 2] },
  route_primary: { color: "#0b5cad", width: 6, casing: true },
  route_alt: { color: "#6a3fb5", width: 4, dash: [4, 2] },
  trail: { color: "#0e7490", width: 3, dash: [1, 1] },
};

function baseStyle(): maplibregl.StyleSpecification {
  const tile = process.env.NEXT_PUBLIC_MAP_TILE_URL;
  const attribution = process.env.NEXT_PUBLIC_MAP_ATTRIBUTION ?? "";
  const layers: maplibregl.LayerSpecification[] = [{ id: "bg", type: "background", paint: { "background-color": "#e9edf1" } }];
  const sources: maplibregl.StyleSpecification["sources"] = {};
  if (tile) {
    // A licensed tile endpoint is required. The public OSM tile service is never configured here.
    sources["base"] = { type: "raster", tiles: [tile], tileSize: 256, attribution };
    layers.push({ id: "base", type: "raster", source: "base" });
  }
  return { version: 8, sources, layers };
}

interface LineCollection {
  type: "FeatureCollection";
  features: Array<{
    type: "Feature";
    id: string;
    properties: { id: string; cls: LineClass };
    geometry: { type: "LineString"; coordinates: Array<[number, number]> };
  }>;
}

function toCollection(lines: readonly MapLine[]): LineCollection {
  return {
    type: "FeatureCollection",
    features: lines.map((l) => ({
      type: "Feature",
      id: l.id,
      properties: { id: l.id, cls: l.cls },
      geometry: { type: "LineString", coordinates: l.coordinates },
    })),
  };
}

const SHAPES: Record<MapPoint["kind"], string> = { vehicle: "square", incident: "diamond", facility: "circle", report: "triangle", self: "circle", stop: "circle" };
const GLYPHS: Record<MapPoint["kind"], string> = { vehicle: "V", incident: "!", facility: "+", report: "R", self: "●", stop: "S" };

export default function MapView({
  ariaLabel,
  lines = [],
  points = [],
  selectedId = null,
  onSelectLine,
  onSelectPoint,
  onViewportChange,
  onMapClick,
  fitBounds,
  fitKey,
  height = 460,
  onError,
}: MapViewProps) {
  const container = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markers = useRef<maplibregl.Marker[]>([]);
  const [ready, setReady] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const cb = useRef({ onSelectLine, onSelectPoint, onViewportChange, onMapClick, onError });
  cb.current = { onSelectLine, onSelectPoint, onViewportChange, onMapClick, onError };
  const pointsRef = useRef(points);
  pointsRef.current = points;
  const selectedRef = useRef(selectedId);
  selectedRef.current = selectedId;

  // Create the map once.
  useEffect(() => {
    if (!container.current) return;
    let map: maplibregl.Map;
    try {
      map = new maplibregl.Map({
        container: container.current,
        style: baseStyle(),
        bounds: NER_BBOX,
        fitBoundsOptions: { padding: 20 },
        attributionControl: { compact: true },
      });
    } catch (e) {
      const message = e instanceof Error ? e.message : "The map could not start (WebGL may be unavailable).";
      setFailure(message);
      cb.current.onError?.(message);
      return;
    }
    mapRef.current = map;
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");

    const emit = () => {
      const b = map.getBounds();
      cb.current.onViewportChange?.({ bbox: [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()], zoom: map.getZoom() });
    };
    let timer: ReturnType<typeof setTimeout> | undefined;
    const debouncedEmit = () => {
      clearTimeout(timer);
      timer = setTimeout(emit, 400);
    };

    map.on("error", (e) => {
      const message = e.error?.message ?? "Map error";
      // Tile failures must not look like "no roads": surface them.
      cb.current.onError?.(message);
    });

    map.on("load", () => {
      map.addSource("lines", { type: "geojson", data: toCollection([]) });
      (Object.keys(LINE_PAINT) as LineClass[]).forEach((cls) => {
        const p = LINE_PAINT[cls];
        if (p.casing) {
          map.addLayer({ id: `casing-${cls}`, type: "line", source: "lines", filter: ["==", ["get", "cls"], cls], paint: { "line-color": "#111", "line-width": p.width + 3 }, layout: { "line-cap": "round" } });
        }
        map.addLayer({
          id: `line-${cls}`,
          type: "line",
          source: "lines",
          filter: ["==", ["get", "cls"], cls],
          paint: { "line-color": p.color, "line-width": p.width, ...(p.dash ? { "line-dasharray": p.dash } : {}) },
          layout: { "line-cap": p.dash ? "butt" : "round", "line-join": "round" },
        });
      });
      map.addLayer({ id: "line-selected", type: "line", source: "lines", filter: ["==", ["get", "id"], ""], paint: { "line-color": "#f59e0b", "line-width": 9, "line-opacity": 0.55 } });
      (Object.keys(LINE_PAINT) as LineClass[]).forEach((cls) => {
        map.on("click", `line-${cls}`, (e) => {
          const id = e.features?.[0]?.properties?.["id"];
          if (typeof id === "string") cb.current.onSelectLine?.(id);
        });
        map.on("mouseenter", `line-${cls}`, () => (map.getCanvas().style.cursor = "pointer"));
        map.on("mouseleave", `line-${cls}`, () => (map.getCanvas().style.cursor = ""));
      });
      setReady(true);
      emit();
    });

    map.on("click", (e) => {
      if (!cb.current.onMapClick) return;
      const hit = map.queryRenderedFeatures(e.point).some((f) => f.layer.id.startsWith("line-"));
      if (!hit) cb.current.onMapClick(e.lngLat.lng, e.lngLat.lat);
    });
    map.on("moveend", () => {
      debouncedEmit();
      renderMarkers();
    });

    function renderMarkers() {
      markers.current.forEach((m) => m.remove());
      markers.current = [];
      const zoom = map.getZoom();
      const bounds = map.getBounds();
      const visible = pointsRef.current.filter((p) => bounds.contains([p.lon, p.lat]));
      for (const item of clusterPoints(visible, zoom)) {
        const el = document.createElement("button");
        el.type = "button";
        el.className = "map-marker";
        if (isCluster(item)) {
          el.dataset["cluster"] = "true";
          el.textContent = String(item.members.length);
          el.setAttribute("aria-label", `${item.members.length} items grouped here; zoom in to separate them`);
          el.addEventListener("click", () => map.easeTo({ center: [item.lon, item.lat], zoom: Math.min(map.getZoom() + 2, 15) }));
        } else {
          el.dataset["shape"] = SHAPES[item.kind];
          el.dataset["tone"] = item.tone ?? "info";
          if (item.stale) el.dataset["stale"] = "true";
          if (selectedRef.current === item.id) el.dataset["selected"] = "true";
          const span = document.createElement("span");
          span.textContent = item.glyph ?? GLYPHS[item.kind];
          el.appendChild(span);
          el.setAttribute("aria-label", item.label);
          el.title = item.label;
          el.addEventListener("click", (ev) => {
            ev.stopPropagation();
            cb.current.onSelectPoint?.(item.id);
          });
        }
        markers.current.push(new maplibregl.Marker({ element: el }).setLngLat([item.lon, item.lat]).addTo(map));
      }
    }
    (map as unknown as { __renderMarkers: () => void }).__renderMarkers = renderMarkers;

    return () => {
      clearTimeout(timer);
      markers.current.forEach((m) => m.remove());
      markers.current = [];
      map.remove();
      mapRef.current = null;
      setReady(false);
    };
  }, []);

  // Push line data.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    (map.getSource("lines") as maplibregl.GeoJSONSource | undefined)?.setData(toCollection(lines));
  }, [lines, ready]);

  // Highlight selected line.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    map.setFilter("line-selected", ["==", ["get", "id"], selectedId ?? ""]);
  }, [selectedId, ready]);

  // Re-render point markers.
  useEffect(() => {
    const map = mapRef.current as (maplibregl.Map & { __renderMarkers?: () => void }) | null;
    if (!map || !ready) return;
    map.__renderMarkers?.();
  }, [points, selectedId, ready]);

  // Fit to requested bounds.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || !fitBounds) return;
    map.fitBounds(fitBounds, { padding: 40, maxZoom: 14, duration: 0 });
    // fitKey intentionally gates refits; fitBounds identity changes every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitKey, ready]);

  if (failure) {
    return (
      <div className="map-frame" style={{ height, display: "grid", placeItems: "center", padding: "1rem" }} role="alert">
        <p>The map could not be displayed ({failure}). Use the list beside it; it contains the same items.</p>
      </div>
    );
  }
  return (
    <div className="map-frame">
      <div ref={container} style={{ height, width: "100%" }} role="application" aria-label={`${ariaLabel}. A list with the same items is provided next to the map.`} />
      {!process.env.NEXT_PUBLIC_MAP_TILE_URL ? (
        <p className="small muted" style={{ margin: 0, padding: "0.4rem 0.6rem", background: "var(--surface)" }}>
          No licensed basemap is configured (NEXT_PUBLIC_MAP_TILE_URL), so only network data is drawn.
        </p>
      ) : null}
    </div>
  );
}
