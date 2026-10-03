"use client";

import { useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import {
  Layers,
  Truck,
  X,
} from "lucide-react";
import { type BBox } from "@/shared/lib/geo";
import { useScopeFilter } from "@/shared/auth";
import { MapLegend, MapView, type MapLine, type MapPoint, type Viewport } from "@/shared/map";
import { Banner, Card, CoverageBanner, ErrorNotice, StatusBadge } from "@/shared/ui";
import { useIncidents, useReports } from "@/features/incidents";
import { useVehicles, useFleetPositions, useTrips } from "@/features/fleet";
import { useRiskZones } from "@/features/hazard";
import { edgeLines, sortBySeverity, summarizeEdges } from "./edges";
import { EdgePanel, FacilityPanel } from "./panels";
import { EDGE_LIMIT, useEdges, useFacilities } from "./queries";

interface LayerState {
  roads: boolean;
  incidents: boolean;
  vehicles: boolean;
  facilities: boolean;
  deliveries: boolean;
  weather: boolean;
  riskZones: boolean;
}

type RoadFilter = "all" | "attention" | "blocked" | "restricted";
type SidebarTab = "incidents" | "fleet" | "analytics" | "segments";

interface Props {
  height?: number;
  showSummary?: boolean;
  routeBase?: string;
  extraPoints?: readonly MapPoint[];
  renderPointDetail?: (id: string, close: () => void) => ReactNode;
  toolbar?: ReactNode;
}

function getIncidentIcon(title: string, desc?: string): { glyph: string; category: string } {
  const t = `${title} ${desc ?? ""}`.toLowerCase();
  if (t.includes("landslide") || t.includes("debris") || t.includes("rockfall") || t.includes("slope")) {
    return { glyph: "🔴", category: "Landslide" };
  }
  if (t.includes("flood") || t.includes("water") || t.includes("river") || t.includes("submerg") || t.includes("overflow")) {
    return { glyph: "🌊", category: "Flood" };
  }
  if (t.includes("bridge") || t.includes("scour") || t.includes("pier") || t.includes("span")) {
    return { glyph: "🌉", category: "Bridge" };
  }
  if (t.includes("subsidence") || t.includes("crack") || t.includes("damage") || t.includes("cave") || t.includes("pothole")) {
    return { glyph: "⚠️", category: "Road Damage" };
  }
  return { glyph: "🚨", category: "Incident" };
}

function getFacilityIcon(kind: string): { glyph: string; label: string } {
  switch (kind) {
    case "HOSPITAL":
      return { glyph: "🏥", label: "Hospital / Medical Center" };
    case "WAREHOUSE":
      return { glyph: "🏭", label: "Relief Warehouse" };
    case "DISTRIBUTION_CENTRE":
    case "LOGISTICS_HUB":
      return { glyph: "📦", label: "Distribution Center" };
    case "DISTRICT_HQ":
      return { glyph: "🏢", label: "Government / District HQ" };
    case "FUEL_DEPOT":
      return { glyph: "⛽", label: "Strategic Fuel Depot" };
    case "OXYGEN_PLANT":
      return { glyph: "💨", label: "Oxygen Plant" };
    default:
      return { glyph: "🏥", label: "Critical Facility" };
  }
}

export function AccessibilityExplorer({
  height = 580,
  showSummary = true,
  routeBase = "/gov/routes",
  extraPoints,
  toolbar,
}: Props) {
  const [viewport, setViewport] = useState<Viewport | null>(null);
  const [selectedEdge, setSelectedEdge] = useState<string | null>(null);
  const [selectedFacility, setSelectedFacility] = useState<string | null>(null);
  const [selectedExtra, setSelectedExtra] = useState<string | null>(null);
  const [selectedVehicleId, setSelectedVehicleId] = useState<string | null>(null);
  const [selectedIncidentId, setSelectedIncidentId] = useState<string | null>(null);

  // Active Map Layers
  const [activeLayers, setActiveLayers] = useState<LayerState>({
    roads: true,
    incidents: true,
    vehicles: true,
    facilities: true,
    deliveries: true,
    weather: false,
    riskZones: true,
  });

  // Default roadFilter to 'attention' so only disrupted/blocked/restricted roads are highlighted as overlays
  const [roadFilter, setRoadFilter] = useState<RoadFilter>("attention");
  const [sidebarTab, setSidebarTab] = useState<SidebarTab>("incidents");
  const [mapError, setMapError] = useState<string | null>(null);

  // State Authority & District Officer Scoping
  const {
    isStateAuthority,
    isDistrictOfficer,
    assignedState,
    assignedDistrict,
    activeBBox,
    isWithinAssignedScope,
  } = useScopeFilter();
  const [scopeActive, setScopeActive] = useState<boolean>(isDistrictOfficer || isStateAuthority);

  const isWithinScope = useMemo(() => {
    return (lon?: number | null, lat?: number | null) => {
      if (!scopeActive) return true;
      return isWithinAssignedScope(lon, lat);
    };
  }, [scopeActive, isWithinAssignedScope]);

  // Core Data Queries
  const edges = useEdges((viewport?.bbox as BBox | undefined) ?? null, viewport?.zoom ?? null);
  const facilities = useFacilities();
  const hazard = useRiskZones((viewport?.bbox as BBox | undefined) ?? null);
  const incidents = useIncidents("ACTIVE");
  const reports = useReports();
  const reportById = useMemo(() => new Map((reports.data ?? []).map((r) => [r.id, r])), [reports.data]);
  const vehicles = useVehicles(true);
  const fleetPositions = useFleetPositions(vehicles.data);
  const trips = useTrips(undefined, true);

  const features = useMemo(() => edges.data?.features ?? [], [edges.data]);
  const summary = useMemo(() => summarizeEdges(features), [features]);
  const allLines = useMemo(() => edgeLines(features), [features]);

  // Filtered Lines according to Active Layer & Filter
  const lines = useMemo<MapLine[]>(() => {
    if (!activeLayers.roads) return [];
    return allLines.filter((l) => {
      if (roadFilter === "all") return true;
      if (roadFilter === "attention") return l.cls !== "open";
      if (roadFilter === "blocked") return l.cls === "blocked";
      if (roadFilter === "restricted") return l.cls === "restricted";
      return true;
    });
  }, [activeLayers.roads, allLines, roadFilter]);

  // Build Comprehensive Points with Domain Icons
  const points = useMemo<MapPoint[]>(() => {
    const list: MapPoint[] = [];

    // 1. Critical Facilities Layer
    if (activeLayers.facilities && facilities.data) {
      for (const f of facilities.data) {
        if (!isWithinScope(f.lon, f.lat)) continue;
        const { glyph, label } = getFacilityIcon(f.kind);
        list.push({
          id: `facility:${f.id}`,
          kind: "facility" as const,
          lon: f.lon,
          lat: f.lat,
          label: `${f.name} · ${label}${f.is_critical ? " (CRITICAL LIFELINE)" : ""}`,
          tone: f.is_critical ? ("danger" as const) : ("info" as const),
          glyph,
        });
      }
    }

    // 2. Active Incidents Layer
    if (activeLayers.incidents && incidents.data) {
      for (const inc of incidents.data) {
        const r = reportById.get(inc.primary_report_id);
        if (r?.location && !isWithinScope(r.location.longitude, r.location.latitude)) continue;
        const { glyph, category } = getIncidentIcon(inc.title, inc.description);
        const tone =
          inc.severity === "CRITICAL" || inc.severity === "HIGH"
            ? ("danger" as const)
            : inc.severity === "MODERATE"
              ? ("warn" as const)
              : ("ok" as const);
        if (r?.location) {
          list.push({
            id: `incident:${inc.id}`,
            kind: "incident" as const,
            lon: r.location.longitude,
            lat: r.location.latitude,
            label: `${inc.title} · ${category} (${inc.severity})`,
            tone,
            glyph,
          });
        }
      }
    }

    // 3. Vehicles & Fleets Layer
    if (activeLayers.vehicles && fleetPositions) {
      for (const fp of fleetPositions) {
        if (!fp.position || fp.position.lat == null || fp.position.lon == null) continue;
        if (!isWithinScope(fp.position.lon, fp.position.lat)) continue;
        const v = fp.vehicle;
        const pos = fp.position;
        const isStale = pos.stale_status === "STALE_WARNING" || pos.stale_status === "FEED_OFFLINE";
        const isDelayed = (pos.speed_kph ?? 0) < 18;

        let tone: "ok" | "warn" | "caution" | "danger" | "neutral" = "ok";
        let statusTag = "Moving normally";

        if (isStale) {
          tone = "neutral";
          statusTag = "Telemetry Stale";
        } else if (isDelayed) {
          tone = "warn";
          statusTag = "Delayed / Mountain Crawl";
        }

        list.push({
          id: `vehicle:${v.id}`,
          kind: "vehicle" as const,
          lon: pos.lon,
          lat: pos.lat,
          label: `${v.registration_number} · ${statusTag} (${pos.speed_kph ?? 0} km/h)`,
          tone,
          glyph: "🚚",
          stale: isStale,
        });
      }
    }

    // Add extra user-supplied markers if any
    if (extraPoints) {
      list.push(...extraPoints);
    }

    return list;
  }, [
    activeLayers.facilities,
    activeLayers.incidents,
    activeLayers.vehicles,
    facilities.data,
    incidents.data,
    reportById,
    fleetPositions,
    extraPoints,
    isWithinScope,
  ]);

  // Incident categories breakdown for mini chart
  const incidentCategories = useMemo(() => {
    const counts = { Landslide: 0, Flood: 0, Bridge: 0, "Road Damage": 0, General: 0 };
    (incidents.data ?? []).forEach((i) => {
      const { category } = getIncidentIcon(i.title, i.description);
      if (category in counts) {
        counts[category as keyof typeof counts] += 1;
      } else {
        counts.General += 1;
      }
    });
    return counts;
  }, [incidents.data]);

  const activeIncidentsList = useMemo(() => {
    const list = incidents.data ?? [];
    if (!scopeActive) return list;
    return list.filter((inc) => {
      const r = reportById.get(inc.primary_report_id);
      return isWithinScope(r?.location?.longitude, r?.location?.latitude);
    });
  }, [incidents.data, scopeActive, reportById, isWithinScope]);

  const activeVehiclesList = useMemo(
    () => fleetPositions.filter((fp) => !fp.position || isWithinScope(fp.position.lon, fp.position.lat)),
    [fleetPositions, isWithinScope]
  );

  const selectedPointId =
    selectedEdge ??
    (selectedFacility ? `facility:${selectedFacility}` : null) ??
    (selectedIncidentId ? `incident:${selectedIncidentId}` : null) ??
    (selectedVehicleId ? `vehicle:${selectedVehicleId}` : null) ??
    selectedExtra;

  const facility = facilities.data?.find((f) => selectedFacility === f.id) ?? null;
  const currentIncident = incidents.data?.find((i) => selectedIncidentId === i.id) ?? null;
  const currentIncidentReport = currentIncident ? reportById.get(currentIncident.primary_report_id) : null;
  const currentVehiclePos = fleetPositions.find((fp) => fp.vehicle.id === selectedVehicleId) ?? null;
  const truncated = features.length >= EDGE_LIMIT;

  const toggleLayer = (layer: keyof LayerState) => {
    setActiveLayers((prev) => ({ ...prev, [layer]: !prev[layer] }));
  };

  return (
    <div className="stack" style={{ gap: "1.25rem" }}>
      {/* District Officer Scoped Banner */}
      {isDistrictOfficer && (
        <div
          style={{
            background: "linear-gradient(90deg, #064e3b 0%, #065f46 100%)",
            color: "#ffffff",
            padding: "0.85rem 1.25rem",
            borderRadius: "12px",
            border: "1px solid #10b981",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            boxShadow: "0 4px 15px rgba(16, 185, 129, 0.15)",
          }}
        >
          <div>
            <div style={{ fontWeight: 800, fontSize: "0.95rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <span>📋 District Incident Verifier Active · {assignedDistrict} Map Command</span>
              <span style={{ background: "#10b981", fontSize: "0.72rem", padding: "0.15rem 0.5rem", borderRadius: "10px", color: "#fff" }}>
                {assignedState} Jurisdiction
              </span>
            </div>
            <div style={{ fontSize: "0.8rem", color: "#a7f3d0", marginTop: "0.2rem" }}>
              Map viewport, ground inspection points, relief fleets, and lifeline facilities are focused on {assignedDistrict}.
            </div>
          </div>
          <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
            <button
              type="button"
              onClick={() => setScopeActive(!scopeActive)}
              style={{
                background: scopeActive ? "#10b981" : "rgba(255,255,255,0.1)",
                border: "1px solid rgba(255,255,255,0.2)",
                color: "#fff",
                fontSize: "0.8rem",
                fontWeight: 600,
                padding: "0.35rem 0.75rem",
                borderRadius: "6px",
                cursor: "pointer",
              }}
            >
              {scopeActive ? `✓ Focused on ${assignedDistrict}` : "Show Full NER Region"}
            </button>
          </div>
        </div>
      )}

      {/* State Authority Scoped Banner */}
      {!isDistrictOfficer && isStateAuthority && (
        <div
          style={{
            background: "linear-gradient(90deg, #091e3a 0%, #1e3a5f 100%)",
            color: "#ffffff",
            padding: "0.85rem 1.25rem",
            borderRadius: "12px",
            border: "1px solid #0284c7",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            boxShadow: "0 4px 15px rgba(2, 132, 199, 0.15)",
          }}
        >
          <div>
            <div style={{ fontWeight: 800, fontSize: "0.95rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <span>🏛️ State Authority Active · {assignedState} State Map Command</span>
              <span style={{ background: "#0284c7", fontSize: "0.72rem", padding: "0.15rem 0.5rem", borderRadius: "10px", color: "#fff" }}>
                Assam Corridors
              </span>
            </div>
            <div style={{ fontSize: "0.8rem", color: "#94a3b8", marginTop: "0.2rem" }}>
              Map viewport, emergency incidents, relief fleets, and lifeline hubs are focused on {assignedState}.
            </div>
          </div>
          <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
            <button
              type="button"
              onClick={() => setScopeActive(!scopeActive)}
              style={{
                background: scopeActive ? "#0284c7" : "rgba(255,255,255,0.1)",
                border: "1px solid rgba(255,255,255,0.2)",
                color: "#fff",
                fontSize: "0.8rem",
                fontWeight: 600,
                padding: "0.35rem 0.75rem",
                borderRadius: "6px",
                cursor: "pointer",
              }}
            >
              {scopeActive ? `✓ Focused on ${assignedState}` : "Show Full NER Region"}
            </button>
          </div>
        </div>
      )}

      {/* 1. MDoNER Top Command Metrics KPI Strip */}
      {showSummary && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))",
            gap: "1rem",
          }}
        >
          {/* Card 1: Verified Open Network */}
          <div
            style={{
              background: "#ffffff",
              borderRadius: "14px",
              padding: "1.1rem 1.25rem",
              border: "1px solid #e2e8f0",
              boxShadow: "0 2px 10px rgba(15, 23, 42, 0.04)",
              transition: "transform 0.15s ease",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: "0.78rem", fontWeight: 600, color: "#64748b" }}>Highway Network Status</span>
              <span style={{ fontSize: "1rem" }}>🛣️</span>
            </div>
            <div style={{ fontSize: "1.85rem", fontWeight: 800, color: "#059669", marginTop: "0.2rem" }}>
              {summary.openLengthShare === null ? "—" : `${Math.round(summary.openLengthShare * 100)}%`}
            </div>
            <div style={{ fontSize: "0.75rem", color: "#64748b", marginTop: "0.15rem" }}>
              Verified Open · {summary.byStatus.BLOCKED} Blocked, {summary.byStatus.RESTRICTED} Restricted
            </div>
          </div>

          {/* Card 2: Active Disaster Incidents */}
          <div
            style={{
              background: "#ffffff",
              borderRadius: "14px",
              padding: "1.1rem 1.25rem",
              border: "1px solid #fed7aa",
              boxShadow: "0 2px 10px rgba(15, 23, 42, 0.04)",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: "0.78rem", fontWeight: 600, color: "#9a3412" }}>Active Incidents in Scope</span>
              <span style={{ fontSize: "1rem" }}>🚨</span>
            </div>
            <div style={{ fontSize: "1.85rem", fontWeight: 800, color: "#c2410c", marginTop: "0.2rem" }}>
              {activeIncidentsList.length} Hazards
            </div>
            <div style={{ fontSize: "0.75rem", color: "#9a3412", marginTop: "0.15rem" }}>
              {activeIncidentsList.filter((i) => i.severity === "CRITICAL").length} Critical · {incidentCategories.Landslide} Landslides, {incidentCategories.Flood} Floods
            </div>
          </div>

          {/* Card 3: Monitored Fleet Convoys */}
          <div
            style={{
              background: "#ffffff",
              borderRadius: "14px",
              padding: "1.1rem 1.25rem",
              border: "1px solid #bae6fd",
              boxShadow: "0 2px 10px rgba(15, 23, 42, 0.04)",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: "0.78rem", fontWeight: 600, color: "#0369a1" }}>Active Logistics Fleets</span>
              <span style={{ fontSize: "1rem" }}>🚚</span>
            </div>
            <div style={{ fontSize: "1.85rem", fontWeight: 800, color: "#0284c7", marginTop: "0.2rem" }}>
              {fleetPositions.length} Vehicles
            </div>
            <div style={{ fontSize: "0.75rem", color: "#64748b", marginTop: "0.15rem" }}>
              {activeVehiclesList.length} GPS online · {trips.data?.length ?? 0} active relief missions
            </div>
          </div>

          {/* Card 4: Critical Lifeline Facilities */}
          <div
            style={{
              background: "#ffffff",
              borderRadius: "14px",
              padding: "1.1rem 1.25rem",
              border: "1px solid #e9d5ff",
              boxShadow: "0 2px 10px rgba(15, 23, 42, 0.04)",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: "0.78rem", fontWeight: 600, color: "#6b21a8" }}>Critical Lifeline Hubs</span>
              <span style={{ fontSize: "1rem" }}>🏥</span>
            </div>
            <div style={{ fontSize: "1.85rem", fontWeight: 800, color: "#7c3aed", marginTop: "0.2rem" }}>
              {facilities.data?.length ?? 0} Sites
            </div>
            <div style={{ fontSize: "0.75rem", color: "#64748b", marginTop: "0.15rem" }}>
              {facilities.data?.filter((f) => f.is_critical).length ?? 0} Tier-1 Hospitals &amp; Oxygen Plants
            </div>
          </div>
        </div>
      )}

      {/* 2. Interactive Floating Layer Control Toolbar */}
      <div
        style={{
          background: "#ffffff",
          borderRadius: "14px",
          padding: "0.75rem 1.25rem",
          border: "1.5px solid #cbd5e1",
          boxShadow: "0 4px 15px rgba(15, 23, 42, 0.04)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: "0.75rem",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <Layers size={18} color="#0284c7" />
          <strong style={{ fontSize: "0.88rem", color: "#0f172a" }}>Map Intelligence Layers:</strong>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
          {/* Roads Layer Toggle */}
          <label
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "0.35rem",
              fontSize: "0.82rem",
              fontWeight: 600,
              padding: "0.3rem 0.65rem",
              borderRadius: "8px",
              background: activeLayers.roads ? "#f0fdf4" : "#f1f5f9",
              border: activeLayers.roads ? "1px solid #bbf7d0" : "1px solid #e2e8f0",
              color: activeLayers.roads ? "#166534" : "#64748b",
              cursor: "pointer",
            }}
          >
            <input
              type="checkbox"
              checked={activeLayers.roads}
              onChange={() => toggleLayer("roads")}
              style={{ accentColor: "#059669" }}
            />
            <span>🛣️ Roads ({summary.total})</span>
          </label>

          {/* Incidents Layer Toggle */}
          <label
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "0.35rem",
              fontSize: "0.82rem",
              fontWeight: 600,
              padding: "0.3rem 0.65rem",
              borderRadius: "8px",
              background: activeLayers.incidents ? "#fef2f2" : "#f1f5f9",
              border: activeLayers.incidents ? "1px solid #fecaca" : "1px solid #e2e8f0",
              color: activeLayers.incidents ? "#991b1b" : "#64748b",
              cursor: "pointer",
            }}
          >
            <input
              type="checkbox"
              checked={activeLayers.incidents}
              onChange={() => toggleLayer("incidents")}
              style={{ accentColor: "#dc2626" }}
            />
            <span>🚨 Incidents ({activeIncidentsList.length})</span>
          </label>

          {/* Vehicles Layer Toggle */}
          <label
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "0.35rem",
              fontSize: "0.82rem",
              fontWeight: 600,
              padding: "0.3rem 0.65rem",
              borderRadius: "8px",
              background: activeLayers.vehicles ? "#eff6ff" : "#f1f5f9",
              border: activeLayers.vehicles ? "1px solid #bfdbfe" : "1px solid #e2e8f0",
              color: activeLayers.vehicles ? "#1e40af" : "#64748b",
              cursor: "pointer",
            }}
          >
            <input
              type="checkbox"
              checked={activeLayers.vehicles}
              onChange={() => toggleLayer("vehicles")}
              style={{ accentColor: "#0284c7" }}
            />
            <span>🚚 Vehicles ({fleetPositions.length})</span>
          </label>

          {/* Facilities Layer Toggle */}
          <label
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "0.35rem",
              fontSize: "0.82rem",
              fontWeight: 600,
              padding: "0.3rem 0.65rem",
              borderRadius: "8px",
              background: activeLayers.facilities ? "#faf5ff" : "#f1f5f9",
              border: activeLayers.facilities ? "1px solid #e9d5ff" : "1px solid #e2e8f0",
              color: activeLayers.facilities ? "#6b21a8" : "#64748b",
              cursor: "pointer",
            }}
          >
            <input
              type="checkbox"
              checked={activeLayers.facilities}
              onChange={() => toggleLayer("facilities")}
              style={{ accentColor: "#7c3aed" }}
            />
            <span>🏥 Facilities ({facilities.data?.length ?? 0})</span>
          </label>

          {/* Landslide Risk Zones Layer Toggle */}
          <label
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "0.35rem",
              fontSize: "0.82rem",
              fontWeight: 600,
              padding: "0.3rem 0.65rem",
              borderRadius: "8px",
              background: activeLayers.riskZones ? "#fffbeb" : "#f1f5f9",
              border: activeLayers.riskZones ? "1px solid #fde68a" : "1px solid #e2e8f0",
              color: activeLayers.riskZones ? "#92400e" : "#64748b",
              cursor: "pointer",
            }}
          >
            <input
              type="checkbox"
              checked={activeLayers.riskZones}
              onChange={() => toggleLayer("riskZones")}
              style={{ accentColor: "#d97706" }}
            />
            <span>⛰️ Risk Zones</span>
          </label>
        </div>
      </div>

      <CoverageBanner
        known={[
          { label: "road segments", count: summary.total },
          { label: "facilities", count: facilities.data?.length ?? 0 },
          { label: "incidents", count: activeIncidentsList.length },
          { label: "fleet vehicles", count: fleetPositions.length },
        ]}
        truncated={truncated}
      />

      {edges.isError && <ErrorNotice error={edges.error} subject="road network" onRetry={() => void edges.refetch()} />}
      {facilities.isError && <ErrorNotice error={facilities.error} subject="facilities" onRetry={() => void facilities.refetch()} />}
      {hazard.isError && <ErrorNotice error={hazard.error} subject="landslide risk zones" onRetry={() => void hazard.refetch()} />}
      {mapError && (
        <Banner tone="warn" title="Map problem">
          <p className="small">{mapError}. The table and sidebar still display full operational data.</p>
        </Banner>
      )}

      {toolbar}

      {/* 3. Main Command Center Layout: Map + Situational Operations Drawer */}
      <div className="split" style={{ alignItems: "start", gap: "1.25rem" }}>
        {/* Left: Map Area with Intact 3D Terrain & Satellite */}
        <div className="stack" style={{ gap: "1rem" }}>
          <div
            style={{
              background: "#ffffff",
              borderRadius: "16px",
              border: "1px solid #e2e8f0",
              overflow: "hidden",
              boxShadow: "0 4px 20px -2px rgba(15, 23, 42, 0.05)",
            }}
          >
            <div
              style={{
                padding: "0.85rem 1.25rem",
                borderBottom: "1px solid #e2e8f0",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                flexWrap: "wrap",
                gap: "0.5rem",
                background: "linear-gradient(90deg, #f8fafc 0%, #ffffff 100%)",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <span
                  style={{
                    width: "8px",
                    height: "8px",
                    borderRadius: "50%",
                    background: "#10b981",
                    display: "inline-block",
                    boxShadow: "0 0 0 3px rgba(16, 185, 129, 0.2)",
                  }}
                />
                <h3 style={{ margin: 0, fontSize: "1.05rem", fontWeight: 800, color: "#0f172a" }}>
                  {isDistrictOfficer
                    ? `${assignedDistrict} District Corridor & Asset Map (${assignedState})`
                    : isStateAuthority
                    ? `${assignedState} State Corridor & Accessibility Map`
                    : "MDoNER Live Regional Situational Map"}
                </h3>
              </div>

              {/* Road Status Quick Filter */}
              <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
                <span style={{ fontSize: "0.78rem", color: "#64748b", fontWeight: 500 }}>Highway Filter:</span>
                <select
                  value={roadFilter}
                  onChange={(e) => setRoadFilter(e.target.value as RoadFilter)}
                  style={{
                    fontSize: "0.78rem",
                    padding: "0.25rem 0.5rem",
                    borderRadius: "6px",
                    border: "1px solid #cbd5e1",
                    background: "#ffffff",
                    fontWeight: 600,
                    color: "#0f172a",
                    cursor: "pointer",
                  }}
                >
                  <option value="all">All Roads</option>
                  <option value="attention">Needs Attention (Closed/Restricted)</option>
                  <option value="blocked">🔴 Blocked Only</option>
                  <option value="restricted">🟡 Restricted Only</option>
                </select>
              </div>
            </div>

            <div style={{ padding: "0.5rem" }}>
              <MapView
                ariaLabel={
                  isDistrictOfficer
                    ? `${assignedDistrict} District Accessibility & Hazards Map`
                    : isStateAuthority
                    ? `${assignedState} State Accessibility & Hazards Map`
                    : "MDoNER Live Regional Accessibility & Hazards Map"
                }
                lines={lines}
                points={points}
                hazardZones={activeLayers.riskZones ? hazard.data?.zones ?? [] : []}
                selectedId={selectedPointId}
                height={height}
                fitBounds={scopeActive && activeBBox ? activeBBox : null}
                fitKey={isDistrictOfficer ? assignedDistrict : isStateAuthority ? assignedState : undefined}
                onViewportChange={setViewport}
                onSelectLine={(id) => {
                  setSelectedEdge(id);
                  setSelectedFacility(null);
                  setSelectedExtra(null);
                  setSelectedVehicleId(null);
                  setSelectedIncidentId(null);
                }}
                onSelectPoint={(id) => {
                  setSelectedEdge(null);
                  if (id.startsWith("facility:")) {
                    setSelectedFacility(id.replace("facility:", ""));
                    setSelectedIncidentId(null);
                    setSelectedVehicleId(null);
                    setSelectedExtra(null);
                  } else if (id.startsWith("incident:")) {
                    setSelectedIncidentId(id.replace("incident:", ""));
                    setSelectedFacility(null);
                    setSelectedVehicleId(null);
                    setSelectedExtra(null);
                  } else if (id.startsWith("vehicle:")) {
                    setSelectedVehicleId(id.replace("vehicle:", ""));
                    setSelectedFacility(null);
                    setSelectedIncidentId(null);
                    setSelectedExtra(null);
                  } else {
                    setSelectedExtra(id);
                    setSelectedFacility(null);
                    setSelectedIncidentId(null);
                    setSelectedVehicleId(null);
                  }
                }}
                onError={setMapError}
              />
              <div style={{ padding: "0.5rem 0.75rem" }}>
                <MapLegend lines={lines} points={points} hazardZones={hazard.data?.zones ?? []} />
              </div>
            </div>
          </div>
        </div>

        {/* Right: Redlands / LogixTrack Inspired Operations Inspector Panel */}
        <div className="stack" style={{ gap: "1rem", minWidth: "320px" }}>
          {/* Selected Entity Inspector Card (If Any Selected) */}
          {selectedEdge && (
            <div style={{ animation: "fadeInUp 0.25s ease" }}>
              <EdgePanel edgeId={selectedEdge} onClose={() => setSelectedEdge(null)} />
            </div>
          )}

          {facility && (
            <div style={{ animation: "fadeInUp 0.25s ease" }}>
              <FacilityPanel facility={facility} onClose={() => setSelectedFacility(null)} routeBase={routeBase} />
            </div>
          )}

          {currentIncident && (
            <Card
              title={
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%" }}>
                  <span style={{ fontSize: "1rem", fontWeight: 700, color: "#991b1b" }}>🚨 Incident Inspection</span>
                  <button
                    type="button"
                    onClick={() => setSelectedIncidentId(null)}
                    style={{ background: "none", border: 0, cursor: "pointer", color: "#64748b" }}
                  >
                    <X size={16} />
                  </button>
                </div>
              }
            >
              <div className="stack" style={{ gap: "0.6rem" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <strong style={{ fontSize: "1rem", color: "#0f172a" }}>{currentIncident.title}</strong>
                  <StatusBadge kind="severity" value={currentIncident.severity} />
                </div>
                <p style={{ margin: 0, fontSize: "0.85rem", color: "#475569", lineHeight: 1.5 }}>
                  {currentIncident.description}
                </p>
                <div style={{ padding: "0.6rem 0.8rem", background: "#f8fafc", borderRadius: "8px", fontSize: "0.78rem", color: "#64748b" }}>
                  GPS Coordinates: {currentIncidentReport?.location ? `${currentIncidentReport.location.latitude.toFixed(4)}, ${currentIncidentReport.location.longitude.toFixed(4)}` : "Report location pending"}
                </div>
                <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.25rem" }}>
                  <Link
                    href={`/gov/incidents?selected=${currentIncident.id}`}
                    className="btn primary small"
                    style={{ flex: 1, textAlign: "center" }}
                  >
                    Manage Incident →
                  </Link>
                  {currentIncidentReport?.location && (
                    <Link
                      href={`${routeBase}?destLat=${currentIncidentReport.location.latitude}&destLon=${currentIncidentReport.location.longitude}`}
                      className="btn small"
                      style={{ flex: 1, textAlign: "center" }}
                    >
                      Route Detour
                    </Link>
                  )}
                </div>
              </div>
            </Card>
          )}

          {currentVehiclePos && (
            <Card
              title={
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%" }}>
                  <span style={{ fontSize: "1rem", fontWeight: 700, color: "#0284c7" }}>🚚 Vehicle Telemetry</span>
                  <button
                    type="button"
                    onClick={() => setSelectedVehicleId(null)}
                    style={{ background: "none", border: 0, cursor: "pointer", color: "#64748b" }}
                  >
                    <X size={16} />
                  </button>
                </div>
              }
            >
              <div className="stack" style={{ gap: "0.6rem" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <strong style={{ fontSize: "1.05rem", color: "#0f172a" }}>
                    {currentVehiclePos.vehicle.registration_number}
                  </strong>
                  <span
                    style={{
                      background: "#e0f2fe",
                      color: "#0369a1",
                      padding: "0.15rem 0.5rem",
                      borderRadius: "9999px",
                      fontSize: "0.75rem",
                      fontWeight: 700,
                    }}
                  >
                    {currentVehiclePos.vehicle.vehicle_type ?? "Commercial HCV"}
                  </span>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.5rem", fontSize: "0.82rem" }}>
                  <div style={{ padding: "0.5rem", background: "#f8fafc", borderRadius: "8px" }}>
                    <span style={{ color: "#64748b", display: "block", fontSize: "0.72rem" }}>Current Speed</span>
                    <strong style={{ color: "#0f172a", fontSize: "1rem" }}>
                      {currentVehiclePos.position?.speed_kph ?? 0} km/h
                    </strong>
                  </div>
                  <div style={{ padding: "0.5rem", background: "#f8fafc", borderRadius: "8px" }}>
                    <span style={{ color: "#64748b", display: "block", fontSize: "0.72rem" }}>Signal Fix</span>
                    <strong style={{ color: "#059669", fontSize: "0.9rem" }}>
                      {currentVehiclePos.position?.stale_status === "FRESH" ? "GPS Online" : "Stale Fix"}
                    </strong>
                  </div>
                </div>
                <p style={{ margin: 0, fontSize: "0.78rem", color: "#64748b" }}>
                  Coordinates: {currentVehiclePos.position?.lat != null ? `${currentVehiclePos.position.lat.toFixed(4)}, ${currentVehiclePos.position.lon.toFixed(4)}` : "No GPS fix"}
                </p>
                <Link
                  href={`/logistics/fleet?vehicle=${currentVehiclePos.vehicle.id}`}
                  className="btn primary small"
                  style={{ width: "100%", textAlign: "center", marginTop: "0.25rem" }}
                >
                  Live Convoy Breadcrumbs →
                </Link>
              </div>
            </Card>
          )}

          {/* Operation Feeds & Analytics Tabs */}
          <div
            style={{
              background: "#ffffff",
              borderRadius: "16px",
              border: "1px solid #e2e8f0",
              boxShadow: "0 4px 20px -2px rgba(15, 23, 42, 0.05)",
              overflow: "hidden",
            }}
          >
            {/* Tab Headers */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr 1fr 1fr",
                borderBottom: "1px solid #e2e8f0",
                background: "#f8fafc",
              }}
            >
              <button
                type="button"
                onClick={() => setSidebarTab("incidents")}
                style={{
                  padding: "0.7rem 0.35rem",
                  border: 0,
                  borderBottom: sidebarTab === "incidents" ? "2.5px solid #0284c7" : "2.5px solid transparent",
                  background: sidebarTab === "incidents" ? "#ffffff" : "transparent",
                  color: sidebarTab === "incidents" ? "#0284c7" : "#64748b",
                  fontWeight: 700,
                  fontSize: "0.78rem",
                  cursor: "pointer",
                }}
              >
                🚨 Hazards ({activeIncidentsList.length})
              </button>

              <button
                type="button"
                onClick={() => setSidebarTab("fleet")}
                style={{
                  padding: "0.7rem 0.35rem",
                  border: 0,
                  borderBottom: sidebarTab === "fleet" ? "2.5px solid #0284c7" : "2.5px solid transparent",
                  background: sidebarTab === "fleet" ? "#ffffff" : "transparent",
                  color: sidebarTab === "fleet" ? "#0284c7" : "#64748b",
                  fontWeight: 700,
                  fontSize: "0.78rem",
                  cursor: "pointer",
                }}
              >
                🚚 Fleets ({activeVehiclesList.length})
              </button>

              <button
                type="button"
                onClick={() => setSidebarTab("segments")}
                style={{
                  padding: "0.7rem 0.35rem",
                  border: 0,
                  borderBottom: sidebarTab === "segments" ? "2.5px solid #0284c7" : "2.5px solid transparent",
                  background: sidebarTab === "segments" ? "#ffffff" : "transparent",
                  color: sidebarTab === "segments" ? "#0284c7" : "#64748b",
                  fontWeight: 700,
                  fontSize: "0.78rem",
                  cursor: "pointer",
                }}
              >
                🛣️ Roads ({summary.total})
              </button>

              <button
                type="button"
                onClick={() => setSidebarTab("analytics")}
                style={{
                  padding: "0.7rem 0.35rem",
                  border: 0,
                  borderBottom: sidebarTab === "analytics" ? "2.5px solid #0284c7" : "2.5px solid transparent",
                  background: sidebarTab === "analytics" ? "#ffffff" : "transparent",
                  color: sidebarTab === "analytics" ? "#0284c7" : "#64748b",
                  fontWeight: 700,
                  fontSize: "0.78rem",
                  cursor: "pointer",
                }}
              >
                📊 Charts
              </button>
            </div>

            <div style={{ padding: "1rem", maxHeight: "460px", overflowY: "auto" }}>
              {/* Tab 1: Active Incidents List (Redlands Emergency Style) */}
              {sidebarTab === "incidents" && (
                <div className="stack" style={{ gap: "0.6rem" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.25rem" }}>
                    <span style={{ fontSize: "0.78rem", fontWeight: 700, color: "#64748b", textTransform: "uppercase" }}>
                      Active Highway Hazards
                    </span>
                    <span style={{ fontSize: "0.72rem", color: "#94a3b8" }}>Click to focus</span>
                  </div>

                  {activeIncidentsList.length === 0 ? (
                    <p style={{ margin: 0, fontSize: "0.85rem", color: "#64748b" }}>No active incidents recorded.</p>
                  ) : (
                    activeIncidentsList.slice(0, 15).map((inc) => {
                      const { glyph, category } = getIncidentIcon(inc.title, inc.description);
                      const isSelected = selectedIncidentId === inc.id;
                      const r = reportById.get(inc.primary_report_id);
                      const coords = r?.location ? `${r.location.latitude.toFixed(2)}, ${r.location.longitude.toFixed(2)}` : "GPS pending";
                      return (
                        <div
                          key={inc.id}
                          onClick={() => {
                            setSelectedIncidentId(inc.id);
                            setSelectedFacility(null);
                            setSelectedVehicleId(null);
                            setSelectedEdge(null);
                          }}
                          style={{
                            padding: "0.65rem 0.75rem",
                            borderRadius: "8px",
                            border: isSelected ? "1.5px solid #0284c7" : "1px solid #e2e8f0",
                            background: isSelected ? "#eff6ff" : "#ffffff",
                            cursor: "pointer",
                            transition: "all 0.15s ease",
                          }}
                        >
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "0.4rem" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
                              <span style={{ fontSize: "1.1rem" }}>{glyph}</span>
                              <strong style={{ fontSize: "0.85rem", color: "#0f172a" }}>{inc.title}</strong>
                            </div>
                            <span
                              style={{
                                fontSize: "0.7rem",
                                fontWeight: 700,
                                padding: "0.1rem 0.4rem",
                                borderRadius: "4px",
                                background: inc.severity === "CRITICAL" ? "#fee2e2" : "#fef3c7",
                                color: inc.severity === "CRITICAL" ? "#991b1b" : "#92400e",
                              }}
                            >
                              {inc.severity}
                            </span>
                          </div>
                          <div style={{ fontSize: "0.75rem", color: "#64748b", marginTop: "0.25rem" }}>
                            {category} · Coords: {coords}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              )}

              {/* Tab 2: Live Vehicles List (LogixTrack Style) */}
              {sidebarTab === "fleet" && (
                <div className="stack" style={{ gap: "0.6rem" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.25rem" }}>
                    <span style={{ fontSize: "0.78rem", fontWeight: 700, color: "#64748b", textTransform: "uppercase" }}>
                      Monitored Fleets &amp; Convoys
                    </span>
                    <span style={{ fontSize: "0.72rem", color: "#94a3b8" }}>Click to focus</span>
                  </div>

                  {activeVehiclesList.length === 0 ? (
                    <p style={{ margin: 0, fontSize: "0.85rem", color: "#64748b" }}>No active vehicle telemetry available.</p>
                  ) : (
                    activeVehiclesList.map((fp) => {
                      const v = fp.vehicle;
                      const pos = fp.position!;
                      const isSelected = selectedVehicleId === v.id;
                      const isStale = pos.stale_status === "STALE_WARNING" || pos.stale_status === "FEED_OFFLINE";
                      return (
                        <div
                          key={v.id}
                          onClick={() => {
                            setSelectedVehicleId(v.id);
                            setSelectedIncidentId(null);
                            setSelectedFacility(null);
                            setSelectedEdge(null);
                          }}
                          style={{
                            padding: "0.65rem 0.75rem",
                            borderRadius: "8px",
                            border: isSelected ? "1.5px solid #0284c7" : "1px solid #e2e8f0",
                            background: isSelected ? "#eff6ff" : "#ffffff",
                            cursor: "pointer",
                            transition: "all 0.15s ease",
                          }}
                        >
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
                              <Truck size={16} color="#0284c7" />
                              <strong style={{ fontSize: "0.88rem", color: "#0f172a" }}>{v.registration_number}</strong>
                            </div>
                            <span
                              style={{
                                fontSize: "0.72rem",
                                fontWeight: 700,
                                color: isStale ? "#64748b" : "#059669",
                              }}
                            >
                              {pos.speed_kph ?? 0} km/h
                            </span>
                          </div>
                          <div style={{ fontSize: "0.75rem", color: "#64748b", marginTop: "0.2rem" }}>
                            Type: {v.vehicle_type ?? "Commercial HCV"} · {isStale ? "Stale Fix" : "GPS Online"}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              )}

              {/* Tab 3: Highway Corridors & Road Status List */}
              {sidebarTab === "segments" && (
                <div className="stack" style={{ gap: "0.6rem" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.25rem" }}>
                    <span style={{ fontSize: "0.78rem", fontWeight: 700, color: "#64748b", textTransform: "uppercase" }}>
                      Regional Highway Corridors ({features.length})
                    </span>
                    <span style={{ fontSize: "0.72rem", color: "#94a3b8" }}>Click to inspect</span>
                  </div>

                  {features.length === 0 ? (
                    <p style={{ margin: 0, fontSize: "0.85rem", color: "#64748b" }}>No road segments found in active network.</p>
                  ) : (
                    sortBySeverity(features).map((feat) => {
                      const p = feat.props;
                      const isSelected = selectedEdge === feat.id;
                      const isBlocked = p.accessibility_status === "BLOCKED";
                      const isRestricted = p.accessibility_status === "RESTRICTED";
                      const statusColor = isBlocked ? "#dc2626" : isRestricted ? "#d97706" : "#16a34a";
                      const statusBg = isBlocked ? "#fee2e2" : isRestricted ? "#fef3c7" : "#dcfce7";
                      const statusIcon = isBlocked ? "🔴" : isRestricted ? "🟡" : "🟢";

                      return (
                        <div
                          key={feat.id}
                          onClick={() => {
                            setSelectedEdge(String(feat.id));
                            setSelectedIncidentId(null);
                            setSelectedFacility(null);
                            setSelectedVehicleId(null);
                          }}
                          style={{
                            padding: "0.65rem 0.75rem",
                            borderRadius: "8px",
                            border: isSelected ? "2px solid #0284c7" : isBlocked ? "1.5px solid #fca5a5" : "1px solid #e2e8f0",
                            background: isSelected ? "#eff6ff" : isBlocked ? "#fff5f5" : "#ffffff",
                            cursor: "pointer",
                            transition: "all 0.15s ease",
                          }}
                        >
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "0.4rem" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
                              <span>{statusIcon}</span>
                              <strong style={{ fontSize: "0.85rem", color: "#0f172a" }}>
                                {p.road_name || `Highway Segment #${p.edge_index}`}
                              </strong>
                            </div>
                            <span
                              style={{
                                fontSize: "0.68rem",
                                fontWeight: 800,
                                padding: "0.1rem 0.4rem",
                                borderRadius: "4px",
                                background: statusBg,
                                color: statusColor,
                                whiteSpace: "nowrap",
                              }}
                            >
                              {p.accessibility_status}
                            </span>
                          </div>
                          <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.74rem", color: "#64748b", marginTop: "0.3rem" }}>
                            <span>{p.road_class} · {Math.round(p.length_meters / 1000)} km</span>
                            <span>Speed: {p.speed_limit_kmh} km/h</span>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              )}

              {/* Tab 4: Redlands-Style Category Visualizations & Analytics */}
              {sidebarTab === "analytics" && (
                <div className="stack" style={{ gap: "1rem" }}>
                  <div>
                    <h4 style={{ margin: "0 0 0.5rem", fontSize: "0.85rem", fontWeight: 700, color: "#0f172a" }}>
                      Incidents by Category
                    </h4>
                    <div style={{ display: "grid", gap: "0.5rem" }}>
                      {Object.entries(incidentCategories).map(([cat, cnt]) => {
                        const total = Math.max(1, activeIncidentsList.length);
                        const pct = Math.round((cnt / total) * 100);
                        return (
                          <div key={cat} style={{ fontSize: "0.78rem" }}>
                            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.15rem" }}>
                              <span style={{ color: "#334155", fontWeight: 500 }}>{cat}</span>
                              <strong style={{ color: "#0f172a" }}>
                                {cnt} ({pct}%)
                              </strong>
                            </div>
                            <div style={{ height: "6px", width: "100%", background: "#f1f5f9", borderRadius: "9999px", overflow: "hidden" }}>
                              <div
                                style={{
                                  height: "100%",
                                  width: `${pct}%`,
                                  background:
                                    cat === "Landslide"
                                      ? "#dc2626"
                                      : cat === "Flood"
                                        ? "#0284c7"
                                        : cat === "Bridge"
                                          ? "#d97706"
                                          : "#059669",
                                }}
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <div style={{ borderTop: "1px solid #f1f5f9", paddingTop: "0.75rem" }}>
                    <h4 style={{ margin: "0 0 0.5rem", fontSize: "0.85rem", fontWeight: 700, color: "#0f172a" }}>
                      Road Network Passability Health
                    </h4>
                    <div style={{ display: "grid", gap: "0.4rem", fontSize: "0.8rem" }}>
                      <div style={{ display: "flex", justifyContent: "space-between" }}>
                        <span style={{ color: "#15803d" }}>🟢 Open Verified:</span>
                        <strong>{summary.openLengthShare === null ? "—" : `${Math.round(summary.openLengthShare * 100)}%`}</strong>
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between" }}>
                        <span style={{ color: "#b45309" }}>🟡 Restricted:</span>
                        <strong>{summary.byStatus.RESTRICTED} Segments</strong>
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between" }}>
                        <span style={{ color: "#b91c1c" }}>🔴 Blocked:</span>
                        <strong>{summary.byStatus.BLOCKED} Segments</strong>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
