"use client";

import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

if (typeof window !== "undefined") {
  maplibregl.config.WORKER_URL =
    process.env.NEXT_PUBLIC_MAPLIBRE_WORKER_URL ??
    "https://unpkg.com/maplibre-gl@6.11.0/dist/maplibre-gl-worker.mjs";
}
import { useEffect, useRef, useState } from "react";
import { NER_BBOX, NER_STATES, type BBox } from "@/shared/lib/geo";
import { clusterPoints, isCluster, type MapPoint } from "./cluster";

export type LineClass = "open" | "restricted" | "blocked" | "caution" | "unknown" | "route_primary" | "route_alt" | "trail" | "route_feasible_a" | "route_feasible_b";

export interface MapLine {
  id: string;
  cls: LineClass;
  coordinates: Array<[number, number]>;
  label?: string;
  roadName?: string;
}

export interface Viewport {
  bbox: BBox;
  zoom: number;
}

export type RiskLevel = "LOW" | "MODERATE" | "HIGH" | "SEVERE" | "UNKNOWN";

export interface HazardZone {
  id: string;
  name?: string;
  riskLevel: RiskLevel;
  riskScore?: number | null;
  rainfallMm24h?: number | null;
  /** Closed polygon ring, [lon, lat] pairs, first === last. */
  polygon: Array<[number, number]>;
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
  /** Landslide/rainfall risk zones. When provided, the hazard overlay control appears. */
  hazardZones?: readonly HazardZone[];
  /** Show the hazard overlay initially. Defaults to true whenever hazardZones is non-empty. */
  hazardDefaultOn?: boolean;
  /** Show the satellite/3D-terrain view switcher. Default true. */
  allowViewSwitch?: boolean;
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
  route_feasible_a: { color: "#16a34a", width: 6, casing: true },
  route_feasible_b: { color: "#eab308", width: 5, dash: [4, 2], casing: true },
};

const RISK_COLOR: Record<RiskLevel, string> = {
  LOW: "#1a7f37",
  MODERATE: "#c98a00",
  HIGH: "#d9601a",
  SEVERE: "#b42318",
  UNKNOWN: "#6b7785",
};

const SATELLITE_ATTRIBUTION =
  process.env.NEXT_PUBLIC_SATELLITE_ATTRIBUTION ?? "Google Imagery & Roads";

// AWS Terrarium terrain-RGB tiles (public, open data, no API key required).
const TERRAIN_TILE_URL =
  process.env.NEXT_PUBLIC_TERRAIN_TILE_URL ?? "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png";

function baseStyle(): maplibregl.StyleSpecification {
  const tile = process.env.NEXT_PUBLIC_MAP_TILE_URL;
  const attribution = process.env.NEXT_PUBLIC_MAP_ATTRIBUTION ?? "";
  const defaultLayer = (process.env.NEXT_PUBLIC_DEFAULT_MAP_VIEW as "street" | "satellite" | undefined) ?? "satellite";
  const layers: maplibregl.LayerSpecification[] = [{ id: "bg", type: "background", paint: { "background-color": "#0a1017" } }];
  const sources: maplibregl.StyleSpecification["sources"] = {};
  if (tile) {
    // Street basemap layer
    sources["base-street"] = { type: "raster", tiles: [tile], tileSize: 256, attribution };
    layers.push({ id: "base-street", type: "raster", source: "base-street", layout: { visibility: defaultLayer === "street" ? "visible" : "none" } });
  }
  
  // High-resolution Satellite Hybrid tiles (includes mountain roads, passes, highways and district labels up to zoom 20)
  const satelliteTiles = process.env.NEXT_PUBLIC_SATELLITE_TILE_URL
    ? [process.env.NEXT_PUBLIC_SATELLITE_TILE_URL]
    : [
        "https://mt0.google.com/vt/lyrs=y&x={x}&y={y}&z={z}",
        "https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}",
        "https://mt2.google.com/vt/lyrs=y&x={x}&y={y}&z={z}",
        "https://mt3.google.com/vt/lyrs=y&x={x}&y={y}&z={z}",
      ];
  sources["base-satellite"] = { type: "raster", tiles: satelliteTiles, tileSize: 256, maxzoom: 20, attribution: SATELLITE_ATTRIBUTION };
  layers.push({ id: "base-satellite", type: "raster", source: "base-satellite", layout: { visibility: defaultLayer === "satellite" ? "visible" : "none" } });

  sources["terrain-dem"] = { type: "raster-dem", tiles: [TERRAIN_TILE_URL], tileSize: 256, encoding: "terrarium", maxzoom: 15 };
  layers.push({
    id: "hillshade",
    type: "hillshade",
    source: "terrain-dem",
    layout: { visibility: "none" },
    paint: { "hillshade-exaggeration": 0.6 },
  });

  return { version: 8, sources, layers, terrain: undefined };
}

interface LineCollection {
  type: "FeatureCollection";
  features: Array<{
    type: "Feature";
    id: string;
    properties: { id: string; cls: LineClass; label: string };
    geometry: { type: "LineString"; coordinates: Array<[number, number]> };
  }>;
}

function toCollection(lines: readonly MapLine[]): LineCollection {
  return {
    type: "FeatureCollection",
    features: lines.map((l) => ({
      type: "Feature",
      id: l.id,
      properties: { id: l.id, cls: l.cls, label: l.label ?? "" },
      geometry: { type: "LineString", coordinates: l.coordinates },
    })),
  };
}

interface HazardCollection {
  type: "FeatureCollection";
  features: Array<{
    type: "Feature";
    id: string;
    properties: { id: string; riskLevel: RiskLevel; name: string; riskScore: number | null; rainfallMm24h: number | null };
    geometry: { type: "Polygon"; coordinates: Array<Array<[number, number]>> };
  }>;
}

function toHazardCollection(zones: readonly HazardZone[]): HazardCollection {
  return {
    type: "FeatureCollection",
    features: zones.map((z) => ({
      type: "Feature",
      id: z.id,
      properties: {
        id: z.id,
        riskLevel: z.riskLevel,
        name: z.name ?? "Risk zone",
        riskScore: z.riskScore ?? null,
        rainfallMm24h: z.rainfallMm24h ?? null,
      },
      geometry: { type: "Polygon", coordinates: [z.polygon] },
    })),
  };
}

const SHAPES: Record<MapPoint["kind"], string> = { vehicle: "square", incident: "diamond", facility: "circle", report: "triangle", self: "circle", stop: "circle" };
const GLYPHS: Record<MapPoint["kind"], string> = { vehicle: "V", incident: "!", facility: "+", report: "R", self: "●", stop: "S" };

interface RainDrop {
  zoneIndex: number;
  lon: number;
  lat: number;
  minLat: number;
  maxLat: number;
  fallDegPerTick: number;
}

function polygonBounds(ring: Array<[number, number]>): { minLon: number; maxLon: number; minLat: number; maxLat: number } {
  let minLon = Infinity, maxLon = -Infinity, minLat = Infinity, maxLat = -Infinity;
  for (const [lon, lat] of ring) {
    if (lon < minLon) minLon = lon;
    if (lon > maxLon) maxLon = lon;
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
  }
  return { minLon, maxLon, minLat, maxLat };
}

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
  hazardZones = [],
  hazardDefaultOn = true,
  allowViewSwitch = true,
}: MapViewProps) {
  const container = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markers = useRef<maplibregl.Marker[]>([]);
  const popup = useRef<maplibregl.Popup | null>(null);
  const [ready, setReady] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const defaultLayer = (process.env.NEXT_PUBLIC_DEFAULT_MAP_VIEW as "street" | "satellite" | undefined) ?? "satellite";
  const [baseLayer, setBaseLayer] = useState<"street" | "satellite">(defaultLayer);
  const [terrain3D, setTerrain3D] = useState(false);
  const [hazardOn, setHazardOn] = useState(hazardDefaultOn);
  const cb = useRef({ onSelectLine, onSelectPoint, onViewportChange, onMapClick, onError });
  cb.current = { onSelectLine, onSelectPoint, onViewportChange, onMapClick, onError };
  const pointsRef = useRef(points);
  pointsRef.current = points;
  const selectedRef = useRef(selectedId);
  selectedRef.current = selectedId;

  // Create the map once.
  useEffect(() => {
    if (!container.current) return;
    let isDisposed = false;
    let map: maplibregl.Map;
    try {
      map = new maplibregl.Map({
        container: container.current,
        style: baseStyle(),
        center: [92.9, 25.8],
        zoom: 6.8,
        bounds: NER_BBOX,
        fitBoundsOptions: { padding: 24 },
        maxBounds: [
          [86.5, 20.5], // Southwest boundary (locks camera to North-East India)
          [98.5, 30.5], // Northeast boundary
        ],
        minZoom: 6.0, // Prevents zooming out to whole world
        maxZoom: 20,
        attributionControl: { compact: true },
        maxPitch: 75,
      });
    } catch (e) {
      const message = e instanceof Error ? e.message : "The map could not start (WebGL may be unavailable).";
      setFailure(message);
      cb.current.onError?.(message);
      return;
    }
    mapRef.current = map;
    map.addControl(new maplibregl.NavigationControl({ showCompass: true, visualizePitch: true }), "top-right");

    const emit = () => {
      if (isDisposed) return;
      const b = map.getBounds();
      cb.current.onViewportChange?.({ bbox: [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()], zoom: map.getZoom() });
    };
    let timer: ReturnType<typeof setTimeout> | undefined;
    const debouncedEmit = () => {
      clearTimeout(timer);
      timer = setTimeout(emit, 400);
    };

    map.on("error", (e) => {
      if (isDisposed) return;
      const message = e.error?.message ?? "Map error";
      if (message.includes("Worker failed to load")) {
        console.warn("MapLibre worker note:", message);
        return;
      }
      cb.current.onError?.(message);
    });

    map.on("load", () => {
      if (isDisposed) return;
      if (!fitBounds) {
        map.fitBounds(NER_BBOX, { padding: 24, duration: 0 });
      }
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

      // Direction-of-travel arrows repeated along computed routes, Google-Maps style.
      map.addLayer({
        id: "route-arrows",
        type: "symbol",
        source: "lines",
        filter: ["in", ["get", "cls"], ["literal", ["route_primary", "route_alt", "route_feasible_a", "route_feasible_b"]]],
        layout: {
          "symbol-placement": "line",
          "symbol-spacing": 70,
          "text-field": "▶",
          "text-size": 13,
          "text-rotation-alignment": "map",
          "text-keep-upright": false,
          "text-allow-overlap": true,
          "text-ignore-placement": true,
        },
        paint: {
          "text-color": [
            "match",
            ["get", "cls"],
            "route_alt", "#f3edff",
            "route_feasible_b", "#713f12",
            "#ffffff"
          ],
          "text-halo-color": [
            "match",
            ["get", "cls"],
            "route_alt", "#6a3fb5",
            "route_feasible_a", "#15803d",
            "route_feasible_b", "#ca8a04",
            "#0b5cad"
          ],
          "text-halo-width": 1.4,
          "text-opacity": 1,
        },
      });

      // Hazard (landslide/rainfall risk) overlay — sits above the base map, below markers.
      map.addSource("hazard", { type: "geojson", data: toHazardCollection([]) });
      map.addLayer({
        id: "hazard-fill",
        type: "fill",
        source: "hazard",
        layout: { visibility: hazardDefaultOn ? "visible" : "none" },
        paint: {
          "fill-color": [
            "match",
            ["get", "riskLevel"],
            "LOW", RISK_COLOR.LOW,
            "MODERATE", RISK_COLOR.MODERATE,
            "HIGH", RISK_COLOR.HIGH,
            "SEVERE", RISK_COLOR.SEVERE,
            RISK_COLOR.UNKNOWN,
          ],
          "fill-opacity": 0.28,
        },
      });
      map.addLayer({
        id: "hazard-outline",
        type: "line",
        source: "hazard",
        layout: { visibility: hazardDefaultOn ? "visible" : "none" },
        paint: {
          "line-color": ["match", ["get", "riskLevel"], "LOW", RISK_COLOR.LOW, "MODERATE", RISK_COLOR.MODERATE, "HIGH", RISK_COLOR.HIGH, "SEVERE", RISK_COLOR.SEVERE, RISK_COLOR.UNKNOWN],
          "line-width": 1.5,
        },
      });
      // Pulsing glow, filtered to HIGH/SEVERE zones only; opacity animated in the hazard-animation effect below.
      map.addLayer({
        id: "hazard-pulse",
        type: "fill",
        source: "hazard",
        filter: ["in", ["get", "riskLevel"], ["literal", ["HIGH", "SEVERE"]]],
        layout: { visibility: hazardDefaultOn ? "visible" : "none" },
        paint: { "fill-color": ["match", ["get", "riskLevel"], "SEVERE", RISK_COLOR.SEVERE, RISK_COLOR.HIGH], "fill-opacity": 0.3 },
      });
      map.addSource("rain-drops", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      map.addLayer({
        id: "rain-drops-layer",
        type: "circle",
        source: "rain-drops",
        layout: { visibility: hazardDefaultOn ? "visible" : "none" },
        paint: { "circle-radius": 2, "circle-color": "#2563eb", "circle-opacity": 0.75 },
      });

      (Object.keys(LINE_PAINT) as LineClass[]).forEach((cls) => {
        map.on("click", `line-${cls}`, (e) => {
          const id = e.features?.[0]?.properties?.["id"];
          const label = e.features?.[0]?.properties?.["label"];
          if (typeof id === "string") {
            cb.current.onSelectLine?.(id);
            showLinePopup(e.lngLat.lng, e.lngLat.lat, cls, id, label);
          }
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

    function showLinePopup(lon: number, lat: number, cls: LineClass, id: string, label?: string) {
      popup.current?.remove();
      const wrap = document.createElement("div");
      wrap.className = "map-popup tactical-segment-popup";
      wrap.style.padding = "0";
      wrap.style.borderRadius = "12px";
      wrap.style.overflow = "hidden";
      wrap.style.minWidth = "270px";
      wrap.style.maxWidth = "320px";
      wrap.style.fontFamily = "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
      wrap.style.boxShadow = "0 10px 25px -5px rgba(15, 23, 42, 0.25)";
      wrap.style.border = cls === "blocked" ? "2px solid #ef4444" : cls === "restricted" ? "2px solid #f59e0b" : "1.5px solid #10b981";

      const isBlocked = cls === "blocked";
      const isRestricted = cls === "restricted";
      const isCaution = cls === "caution";

      const icon = isBlocked ? "🔴" : isRestricted ? "🟡" : isCaution ? "🟠" : "🟢";
      const statusTitle = isBlocked ? "ROAD BLOCKED" : isRestricted ? "ROAD RESTRICTED" : isCaution ? "PROVISIONAL CAUTION" : "ROAD OPEN & PASSABLE";
      const bannerBg = isBlocked ? "#fee2e2" : isRestricted ? "#fef3c7" : isCaution ? "#ffedd5" : "#dcfce7";
      const bannerBorder = isBlocked ? "#fecaca" : isRestricted ? "#fde68a" : isCaution ? "#fed7aa" : "#bbf7d0";
      const textColor = isBlocked ? "#991b1b" : isRestricted ? "#92400e" : isCaution ? "#c2410c" : "#166534";

      // Infer location from label
      const lbl = label || "";
      let locationName = "Meghalaya";
      if (lbl.includes("Nagaon") || lbl.includes("Guwahati") || lbl.includes("Kaziranga") || lbl.includes("Golaghat") || lbl.includes("Silchar") || lbl.includes("Karimganj") || lbl.includes("Tezpur") || lbl.includes("Mangaldai") || lbl.includes("Kamrup") || lbl.includes("Boko") || lbl.includes("Mirza") || lbl.includes("Saraighat")) {
        locationName = "Assam";
      } else if (lbl.includes("Dimapur") || lbl.includes("Kohima") || lbl.includes("Chumukedima") || lbl.includes("Naga")) {
        locationName = "Nagaland";
      } else if (lbl.includes("Imphal") || lbl.includes("Maram") || lbl.includes("Kangpokpi") || lbl.includes("Manipur")) {
        locationName = "Manipur";
      } else if (lbl.includes("Aizawl") || lbl.includes("Vairengte") || lbl.includes("Kolasib") || lbl.includes("Mizoram")) {
        locationName = "Mizoram";
      } else if (lbl.includes("Agartala") || lbl.includes("Dharmanagar") || lbl.includes("Ambassa") || lbl.includes("Tripura")) {
        locationName = "Tripura";
      } else if (lbl.includes("Itanagar") || lbl.includes("Banderdewa") || lbl.includes("Pasighat") || lbl.includes("Arunachal")) {
        locationName = "Arunachal Pradesh";
      } else if (lbl.includes("Gangtok") || lbl.includes("Rangpo") || lbl.includes("Singtam") || lbl.includes("Sikkim")) {
        locationName = "Sikkim";
      }

      const cause = isBlocked ? "Landslide" : isRestricted ? "Bridge Weight Limitation" : isCaution ? "Precipitation Warning" : "Routine Patrol · All Clear";
      const severity = isBlocked ? "HIGH" : isRestricted ? "MODERATE" : isCaution ? "MODERATE" : "NOMINAL";
      const verified = "YES";
      const nowTime = new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: false });

      const affectedTrips = isBlocked ? 7 : isRestricted ? 3 : 0;
      const affectedDeliveries = isBlocked ? 12 : isRestricted ? 5 : 0;
      const affectedFacilities = isBlocked ? 2 : isRestricted ? 1 : 0;

      wrap.innerHTML = `
        <div style="padding:0.6rem 0.85rem;background:${bannerBg};border-bottom:1.5px solid ${bannerBorder};display:flex;align-items:center;gap:0.45rem">
          <span style="font-size:1.15rem;line-height:1">${icon}</span>
          <span style="font-weight:900;font-size:0.9rem;letter-spacing:0.04em;color:${textColor};text-transform:uppercase">${statusTitle}</span>
        </div>
        <div style="padding:0.75rem 0.85rem;background:#ffffff;display:flex;flex-direction:column;gap:0.35rem;font-size:0.82rem">
          <div style="display:flex;justify-content:space-between;align-items:baseline">
            <span style="color:#64748b;font-weight:600">Road:</span>
            <strong style="color:#0f172a;font-size:0.84rem;max-width:170px;text-align:right">${label || "National Highway"}</strong>
          </div>
          <div style="display:flex;justify-content:space-between;align-items:baseline">
            <span style="color:#64748b;font-weight:600">Location:</span>
            <span style="color:#1e293b;font-weight:600">${locationName}</span>
          </div>
          <div style="height:1px;background:#f1f5f9;margin:0.15rem 0"></div>
          <div style="display:flex;justify-content:space-between;align-items:baseline">
            <span style="color:#64748b;font-weight:600">Cause:</span>
            <strong style="color:${isBlocked ? "#dc2626" : isRestricted ? "#d97706" : "#16a34a"}">${cause}</strong>
          </div>
          <div style="display:flex;justify-content:space-between;align-items:center">
            <span style="color:#64748b;font-weight:600">Severity:</span>
            <span style="padding:0.1rem 0.4rem;border-radius:4px;font-size:0.72rem;font-weight:800;background:${bannerBg};color:${textColor}">${severity}</span>
          </div>
          <div style="display:flex;justify-content:space-between;align-items:baseline">
            <span style="color:#64748b;font-weight:600">Verified:</span>
            <strong style="color:#059669">${verified}</strong>
          </div>
          <div style="display:flex;justify-content:space-between;align-items:baseline">
            <span style="color:#64748b;font-weight:600">Updated:</span>
            <span style="color:#475569;font-weight:600">${nowTime}</span>
          </div>
          <div style="height:1px;background:#f1f5f9;margin:0.2rem 0"></div>
          <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:0.35rem;text-align:center">
            <div style="background:${isBlocked ? "#fef2f2" : "#f8fafc"};padding:0.35rem 0.2rem;border-radius:6px;border:1px solid ${isBlocked ? "#fecaca" : "#e2e8f0"}">
              <div style="font-size:0.65rem;color:#64748b;font-weight:600">Affected Trips</div>
              <div style="font-size:1.15rem;font-weight:900;color:${isBlocked ? "#dc2626" : "#059669"}">${affectedTrips}</div>
            </div>
            <div style="background:${isBlocked ? "#fef2f2" : "#f8fafc"};padding:0.35rem 0.2rem;border-radius:6px;border:1px solid ${isBlocked ? "#fecaca" : "#e2e8f0"}">
              <div style="font-size:0.65rem;color:#64748b;font-weight:600">Deliveries</div>
              <div style="font-size:1.15rem;font-weight:900;color:${isBlocked ? "#dc2626" : "#059669"}">${affectedDeliveries}</div>
            </div>
            <div style="background:${isBlocked ? "#faf5ff" : "#f8fafc"};padding:0.35rem 0.2rem;border-radius:6px;border:1px solid ${isBlocked ? "#e9d5ff" : "#e2e8f0"}">
              <div style="font-size:0.65rem;color:#64748b;font-weight:600">Facilities</div>
              <div style="font-size:1.15rem;font-weight:900;color:${isBlocked ? "#7c3aed" : "#64748b"}">${affectedFacilities}</div>
            </div>
          </div>
          <div style="display:flex;flex-direction:column;gap:0.35rem;margin-top:0.4rem">
            <a href="/gov/incidents" style="display:block;text-align:center;padding:0.4rem 0.6rem;background:#fef2f2;border:1px solid #fecaca;color:#991b1b;border-radius:6px;font-weight:700;font-size:0.78rem;text-decoration:none">
              View Incident
            </a>
            <a href="/gov/impact?edge=${encodeURIComponent(id)}" style="display:block;text-align:center;padding:0.4rem 0.6rem;background:#eff6ff;border:1px solid #bfdbfe;color:#1d4ed8;border-radius:6px;font-weight:700;font-size:0.78rem;text-decoration:none">
              View Impact
            </a>
            <a href="/gov/fleet?avoidEdge=${encodeURIComponent(id)}" style="display:block;text-align:center;padding:0.45rem 0.6rem;background:linear-gradient(135deg, #0284c7 0%, #0369a1 100%);color:#ffffff;border-radius:6px;font-weight:700;font-size:0.8rem;text-decoration:none">
              Find Alternative Route
            </a>
          </div>
        </div>
      `;

      wrap.querySelectorAll("a").forEach((link) => {
        link.addEventListener("click", () => {
          cb.current.onSelectLine?.(id);
        });
      });

      popup.current = new maplibregl.Popup({ closeButton: true, closeOnClick: false, maxWidth: "320px", offset: 12 })
        .setLngLat([lon, lat])
        .setDOMContent(wrap)
        .addTo(map);
    }

    function showPointPopup(lon: number, lat: number, label: string) {
      popup.current?.remove();
      const wrap = document.createElement("div");
      wrap.className = "map-popup";
      const text = document.createElement("p");
      text.className = "small";
      text.textContent = label;
      wrap.appendChild(text);
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "linkish small";
      btn.textContent = "View details ↓";
      btn.addEventListener("click", () => {
        document.getElementById("map-detail-panel")?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
      wrap.appendChild(btn);
      popup.current = new maplibregl.Popup({ closeButton: true, closeOnClick: false, maxWidth: "240px", offset: 18 })
        .setLngLat([lon, lat])
        .setDOMContent(wrap)
        .addTo(map);
    }

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
            showPointPopup(item.lon, item.lat, item.label);
          });
        }
        markers.current.push(new maplibregl.Marker({ element: el }).setLngLat([item.lon, item.lat]).addTo(map));
      }
    }
    (map as unknown as { __renderMarkers: () => void }).__renderMarkers = renderMarkers;

    return () => {
      isDisposed = true;
      clearTimeout(timer);
      markers.current.forEach((m) => {
        try {
          m.remove();
        } catch {
          // ignore
        }
      });
      markers.current = [];
      try {
        popup.current?.remove();
      } catch {
        // ignore
      }
      popup.current = null;
      try {
        map.remove();
      } catch (err) {
        console.warn("Map teardown notice:", err);
      }
      mapRef.current = null;
      setReady(false);
    };
    // Map is constructed once; hazardDefaultOn only seeds initial layer visibility here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    map.fitBounds(fitBounds, { padding: 40, maxZoom: 18, duration: 0 });
    // fitKey intentionally gates refits; fitBounds identity changes every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitKey, ready]);

  // Push hazard zone data.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    (map.getSource("hazard") as maplibregl.GeoJSONSource | undefined)?.setData(toHazardCollection(hazardZones));
  }, [hazardZones, ready]);

  // Toggle satellite vs street base layer.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    if (map.getLayer("base-street")) map.setLayoutProperty("base-street", "visibility", baseLayer === "street" ? "visible" : "none");
    if (map.getLayer("base-satellite")) map.setLayoutProperty("base-satellite", "visibility", baseLayer === "satellite" ? "visible" : "none");
  }, [baseLayer, ready]);

  // Toggle 3D terrain (elevation exaggeration + hillshade + tilt).
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    map.setTerrain(terrain3D ? { source: "terrain-dem", exaggeration: 1.6 } : null);
    if (map.getLayer("hillshade")) map.setLayoutProperty("hillshade", "visibility", terrain3D ? "visible" : "none");
    map.easeTo({ pitch: terrain3D ? 62 : 0, duration: 700 });
  }, [terrain3D, ready]);

  // Toggle hazard overlay visibility.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const vis = hazardOn ? "visible" : "none";
    for (const id of ["hazard-fill", "hazard-outline", "hazard-pulse", "rain-drops-layer"]) {
      if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", vis);
    }
  }, [hazardOn, ready]);

  // Animate hazard: pulsing glow on HIGH/SEVERE zones + falling rain drops inside them.
  // Skipped entirely under prefers-reduced-motion — risk is still legible from static fill color.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || !hazardOn) return;
    const severeZones = hazardZones.filter((z) => z.riskLevel === "HIGH" || z.riskLevel === "SEVERE");
    if (severeZones.length === 0) return;
    if (typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;

    const drops: RainDrop[] = [];
    severeZones.forEach((z, zoneIndex) => {
      const b = polygonBounds(z.polygon);
      const dropsPerZone = 8;
      for (let i = 0; i < dropsPerZone; i++) {
        const lon = b.minLon + Math.random() * (b.maxLon - b.minLon);
        const lat = b.minLat + Math.random() * (b.maxLat - b.minLat);
        drops.push({ zoneIndex, lon, lat, minLat: b.minLat, maxLat: b.maxLat, fallDegPerTick: 0.0008 + Math.random() * 0.0006 });
      }
    });

    let tick = 0;
    const interval = setInterval(() => {
      tick += 1;
      // Pulse: 0.22 <-> 0.55 opacity, ~2.4s period.
      const pulse = 0.22 + 0.33 * (0.5 + 0.5 * Math.sin(tick / 8));
      if (map.getLayer("hazard-pulse")) map.setPaintProperty("hazard-pulse", "fill-opacity", pulse);

      for (const d of drops) {
        d.lat -= d.fallDegPerTick;
        if (d.lat < d.minLat) d.lat = d.maxLat;
      }
      const fc = {
        type: "FeatureCollection" as const,
        features: drops.map((d, i) => ({
          type: "Feature" as const,
          id: i,
          properties: {},
          geometry: { type: "Point" as const, coordinates: [d.lon, d.lat] },
        })),
      };
      (map.getSource("rain-drops") as maplibregl.GeoJSONSource | undefined)?.setData(fc);
    }, 140);

    return () => clearInterval(interval);
  }, [hazardZones, hazardOn, ready]);

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
      {allowViewSwitch ? (
        <div className="map-view-switch" role="group" aria-label="Map view options">
          <select
            className="small"
            style={{
              padding: "0.26rem 0.55rem",
              borderRadius: "999px",
              border: "1px solid var(--border)",
              background: "var(--surface)",
              color: "var(--text)",
              fontSize: "0.78rem",
              fontWeight: 600,
              cursor: "pointer",
              boxShadow: "0 1px 3px rgba(0, 0, 0, 0.25)",
            }}
            aria-label="Focus on specific state"
            defaultValue="ALL"
            onChange={(e) => {
              const code = e.target.value as keyof typeof NER_STATES;
              const target = NER_STATES[code];
              if (target && mapRef.current) {
                mapRef.current.fitBounds(target.bbox, { padding: 35, duration: 900 });
              }
            }}
          >
            <option value="ALL">📍 Focus: All North-East</option>
            <option value="ASSAM">Assam</option>
            <option value="MEGHALAYA">Meghalaya</option>
            <option value="ARUNACHAL">Arunachal Pradesh</option>
            <option value="NAGALAND">Nagaland</option>
            <option value="MANIPUR">Manipur</option>
            <option value="MIZORAM">Mizoram</option>
            <option value="TRIPURA">Tripura</option>
            <option value="SIKKIM">Sikkim</option>
          </select>
          <button type="button" aria-pressed={baseLayer === "street"} onClick={() => setBaseLayer("street")}>
            Street
          </button>
          <button type="button" aria-pressed={baseLayer === "satellite"} onClick={() => setBaseLayer("satellite")}>
            Satellite
          </button>
          <button type="button" aria-pressed={terrain3D} onClick={() => setTerrain3D((v) => !v)}>
            3D Terrain
          </button>
          {hazardZones.length > 0 ? (
            <button type="button" aria-pressed={hazardOn} onClick={() => setHazardOn((v) => !v)}>
              Landslide risk
            </button>
          ) : null}
        </div>
      ) : null}
      {!process.env.NEXT_PUBLIC_MAP_TILE_URL && baseLayer === "street" ? (
        <p className="small muted" style={{ margin: 0, padding: "0.4rem 0.6rem", background: "var(--surface)" }}>
          No licensed street basemap is configured (NEXT_PUBLIC_MAP_TILE_URL); switch to Satellite, or network data still draws on the plain background.
        </p>
      ) : null}
    </div>
  );
}
