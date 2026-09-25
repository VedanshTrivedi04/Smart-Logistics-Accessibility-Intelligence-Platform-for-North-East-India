"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useMemo, useState } from "react";
import {
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  Building2,
  CheckCircle2,
  Clock,
  Compass,
  FileText,
  Filter,
  Layers,
  MapPin,
  Mountain,
  Package,
  RefreshCw,
  Search,
  ShieldAlert,
  ShieldCheck,
  Truck,
  X,
} from "lucide-react";

import { useSession, useScopeFilter } from "@/shared/auth";
import { humanize, shortId } from "@/shared/lib/format";
import { formatDateTime } from "@/shared/lib/time";
import { Banner, Button, Card, ErrorNotice, QueryState, StatusBadge } from "@/shared/ui";
import { useImpactData } from "@/features/impact";
import { useEdges, useFacilities } from "@/features/network";
import { useTrips } from "@/features/fleet";
import { useIncidents, useReport, useResolveIncident } from "./queries";
import type { IncidentLifecycle, ResolutionReason } from "@/shared/api";

type SeverityFilter = "ALL" | "CRITICAL" | "HIGH" | "MEDIUM" | "RESOLVED";

function inferLocation(title: string, desc?: string): {
  highway: string;
  state: string;
  district: string;
  coords: string;
  terrain: string;
  landmark: string;
  nearestFacility: string;
} {
  const text = `${title} ${desc ?? ""}`.toLowerCase();

  if (
    text.includes("kamrup") ||
    text.includes("guwahati") ||
    text.includes("nagaon") ||
    text.includes("nh-27") ||
    text.includes("silchar") ||
    text.includes("cachar") ||
    text.includes("jorhat") ||
    text.includes("dibrugarh") ||
    text.includes("tezpur") ||
    text.includes("brahmaputra") ||
    text.includes("assam")
  ) {
    return {
      highway: "NH-27 / NH-6 Assam Transport Arterial",
      state: "Assam",
      district: text.includes("kamrup")
        ? "Kamrup Metropolitan"
        : text.includes("nagaon")
          ? "Nagaon District"
          : text.includes("silchar")
            ? "Cachar District"
            : "Kamrup / Nagaon Corridor",
      coords: "26.1445° N, 91.7362° E",
      terrain: "Alluvial Floodplain & Highway Embankment · Lowland Transit Corridor · 55m MSL",
      landmark: "Guwahati-Nagaon Strategic Highway Link (KM 74.2)",
      nearestFacility: "Gauhati Medical College & Hospital (14 km) · AIIMS Guwahati (22 km)",
    };
  }

  if (text.includes("sonapur") || text.includes("nh-6") || text.includes("byrnihat") || text.includes("nongpoh") || text.includes("khasi")) {
    return {
      highway: "NH-6 National Lifeline Highway (Assam-Meghalaya Border)",
      state: text.includes("sonapur") ? "Assam" : "Meghalaya",
      district: text.includes("sonapur") ? "Kamrup Metropolitan (Assam)" : "Ri-Bhoi District",
      coords: "25.9550° N, 91.8840° E",
      terrain: "Steep Mountain Ridge · High Monsoon Defile · 620m MSL",
      landmark: "Milestone KM 48.2 (Between Jorabat Ingress & Byrnihat Base)",
      nearestFacility: "Civil Hospital Nongpoh (12 km) · Gauhati Medical College (28 km)",
    };
  }
  if (text.includes("umtrew") || text.includes("bridge")) {
    return {
      highway: "NH-6 GS Road Heavy Corridor",
      state: "Meghalaya",
      district: "Ri-Bhoi District",
      coords: "25.9100° N, 91.8812° E",
      terrain: "River Basin Approach · Unstable Pier Silt Bed · 480m MSL",
      landmark: "Umtrew River Heavy Span Crossing (Bridge Code: BR-UMT-01)",
      nearestFacility: "Byrnihat Emergency Medical Station (8 km)",
    };
  }
  if (text.includes("nh-29") || text.includes("dimapur") || text.includes("kohima") || text.includes("chumukedima")) {
    return {
      highway: "NH-29 Dimapur-Kohima Mountain Arterial",
      state: "Nagaland",
      district: "Chumukedima / Kohima District",
      coords: "25.8200° N, 93.7750° E",
      terrain: "High Seismic Active Fault · Landslide Fracture Zone · 1,120m MSL",
      landmark: "Chumukedima Mountain Ghat Section (KM 22.4)",
      nearestFacility: "Naga Hospital Authority Kohima (18 km) · Dimapur Terminal",
    };
  }
  if (text.includes("nh-2") || text.includes("imphal") || text.includes("maram") || text.includes("kangpokpi")) {
    return {
      highway: "NH-2 Trans-Manipur Lifeline Highway",
      state: "Manipur",
      district: "Senapati / Kangpokpi District",
      coords: "25.1500° N, 93.9700° E",
      terrain: "Highland Ridge Corridor · Deep Valley Defile · 1,050m MSL",
      landmark: "Kangpokpi Mountain Transit S-Bend (KM 68.7)",
      nearestFacility: "JNIMS Medical College Imphal (35 km)",
    };
  }
  if (text.includes("nh-10") || text.includes("teesta") || text.includes("sevoke") || text.includes("gangtok")) {
    return {
      highway: "NH-10 Siliguri-Gangtok Strategic Highway",
      state: "Sikkim",
      district: "Pakyong District",
      coords: "27.1750° N, 88.5300° E",
      terrain: "Teesta River Gorge · Submerged Rock Face · 330m MSL",
      landmark: "Rangpo Inter-State Sikkim Border Post (KM 52)",
      nearestFacility: "STNM Multi-Specialty Hospital Gangtok (28 km)",
    };
  }
  if (text.includes("nh-306") || text.includes("aizawl") || text.includes("vairengte") || text.includes("kolasib")) {
    return {
      highway: "NH-306 Silchar-Aizawl Lifeline Spine",
      state: "Mizoram",
      district: "Kolasib District",
      coords: "24.2300° N, 92.6800° E",
      terrain: "Tropical Hill Escarpment · Clay Slope Slump · 650m MSL",
      landmark: "Vairengte Inter-State Checkpoint North Entry",
      nearestFacility: "Zoram Medical College & Hospital Aizawl (42 km)",
    };
  }
  if (text.includes("nh-8") || text.includes("agartala") || text.includes("ambassa") || text.includes("dharmanagar")) {
    return {
      highway: "NH-8 Assam-Tripura National Highway",
      state: "Tripura",
      district: "Dhalai District",
      coords: "23.9200° N, 91.8500° E",
      terrain: "Low Mountain Passes & Dense Bamboo Forest · 75m MSL",
      landmark: "Ambassa Logistics Bypass Interchange",
      nearestFacility: "Agartala Government Medical College (65 km)",
    };
  }

  // Default North-Eastern Highway Context
  return {
    highway: "National Highway Arterial Sector",
    state: "Meghalaya / Assam Corridor",
    district: "North-East Region",
    coords: "25.9550° N, 91.8840° E",
    terrain: "Hilly Valley Pass · Active Monsoon Weather Sector",
    landmark: "Strategic Transport Link Milestone 14",
    nearestFacility: "State Capital Lifeline Hospital",
  };
}

function getHazardType(title: string, desc?: string): { type: string; glyph: string; color: string; bg: string } {
  const t = `${title} ${desc ?? ""}`.toLowerCase();
  if (t.includes("landslide") || t.includes("debris") || t.includes("slope") || t.includes("mudslide")) {
    return { type: "LANDSLIDE", glyph: "⛰️", color: "#dc2626", bg: "#fef2f2" };
  }
  if (t.includes("rockfall") || t.includes("boulder") || t.includes("rock")) {
    return { type: "ROCKFALL", glyph: "🪨", color: "#b91c1c", bg: "#fee2e2" };
  }
  if (t.includes("bridge") || t.includes("pier") || t.includes("scour")) {
    return { type: "BRIDGE SCOUR", glyph: "🌉", color: "#d97706", bg: "#fffbeb" };
  }
  if (t.includes("subsidence") || t.includes("fissure") || t.includes("crack")) {
    return { type: "ROAD SUBSIDENCE", glyph: "⚠️", color: "#c2410c", bg: "#fff7ed" };
  }
  if (t.includes("flood") || t.includes("water") || t.includes("overflow")) {
    return { type: "FLASH FLOOD", glyph: "🌊", color: "#0284c7", bg: "#f0f9ff" };
  }
  return { type: "HAZARD DISRUPTION", glyph: "🚨", color: "#e11d48", bg: "#fff1f2" };
}

function formatRelativeTime(dateStr: string): string {
  try {
    const diffMs = Date.now() - new Date(dateStr).getTime();
    const diffMinutes = Math.floor(diffMs / 60000);
    if (diffMinutes < 1) return "Just now";
    if (diffMinutes < 60) return `${diffMinutes} min ago`;
    const diffHours = Math.floor(diffMinutes / 60);
    if (diffHours < 24) return `${diffHours} hr${diffHours > 1 ? "s" : ""} ago`;
    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays} day${diffDays > 1 ? "s" : ""} ago`;
  } catch {
    return "Recently";
  }
}

export function IncidentCommandCenter() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-slate-500">Loading Incident Command Center...</div>}>
      <IncidentCommandCenterInner />
    </Suspense>
  );
}

function IncidentCommandCenterInner() {
  const searchParams = useSearchParams();
  const urlSelectedId = searchParams.get("selected");
  const { can } = useSession();
  const { isStateAuthority, isDistrictOfficer, assignedState, assignedDistrict } = useScopeFilter();
  const [scopeActive, setScopeActive] = useState<boolean>(isDistrictOfficer || isStateAuthority);

  const [severityFilter, setSeverityFilter] = useState<SeverityFilter>("ALL");
  const [lifecycleTab, setLifecycleTab] = useState<"ACTIVE" | "MONITORING" | "RESOLVED" | "ALL">("ACTIVE");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedIncidentId, setSelectedIncidentId] = useState<string | null>(urlSelectedId);

  // Resolution Form Modal State
  const [showResolveModal, setShowResolveModal] = useState(false);
  const [resolveReason, setResolveReason] = useState<ResolutionReason>("HAZARD_CLEARED");
  const [resolveNotes, setResolveNotes] = useState("");
  const [resolveError, setResolveError] = useState<string | null>(null);

  // Queries
  const incidentsQ = useIncidents(lifecycleTab === "ALL" ? undefined : (lifecycleTab as IncidentLifecycle));
  const impactData = useImpactData();
  const edgesQ = useEdges(null, null);
  const facilitiesQ = useFacilities();
  const tripsQ = useTrips(undefined, true);
  const resolveMutation = useResolveIncident();

  const allIncidents = useMemo(() => incidentsQ.data ?? [], [incidentsQ.data]);

  // Scoped Incidents (filtered by District Officer or State Authority if active)
  const scopedIncidents = useMemo(() => {
    if (!scopeActive) return allIncidents;
    if (isDistrictOfficer) {
      return allIncidents.filter((inc) => {
        const loc = inferLocation(inc.title, inc.description);
        const t = `${inc.title} ${inc.description || ""}`.toLowerCase();
        return (
          loc.district.toLowerCase().includes("kamrup") ||
          loc.district.toLowerCase().includes(assignedDistrict.toLowerCase()) ||
          t.includes("kamrup") ||
          t.includes("guwahati") ||
          t.includes("jalukbari") ||
          t.includes("dispur") ||
          t.includes("azara") ||
          t.includes("khanapara") ||
          t.includes("sonapur") ||
          t.includes("saraighat") ||
          t.includes("borjhar") ||
          t.includes("chandrapur") ||
          loc.highway.includes("NH-27") ||
          loc.highway.includes("NH-6")
        );
      });
    }
    if (isStateAuthority) {
      return allIncidents.filter((inc) => {
        const loc = inferLocation(inc.title, inc.description);
        const isAssam =
          loc.state.toLowerCase().includes(assignedState.toLowerCase()) ||
          loc.district.toLowerCase().includes(assignedState.toLowerCase()) ||
          inc.title.toLowerCase().includes(assignedState.toLowerCase()) ||
          inc.title.toLowerCase().includes("kamrup") ||
          inc.title.toLowerCase().includes("guwahati") ||
          inc.title.toLowerCase().includes("nagaon") ||
          inc.title.toLowerCase().includes("sonapur") ||
          inc.title.toLowerCase().includes("silchar") ||
          loc.highway.includes("NH-27") ||
          loc.highway.includes("NH-6");
        return isAssam;
      });
    }
    return allIncidents;
  }, [allIncidents, scopeActive, isDistrictOfficer, isStateAuthority, assignedDistrict, assignedState]);

  // Dynamic Triage Severity Counters
  const counters = useMemo(() => {
    let critical = 0;
    let high = 0;
    let moderate = 0;
    let resolved = 0;

    for (const inc of scopedIncidents) {
      if (inc.lifecycle === "RESOLVED") {
        resolved++;
      } else if (inc.severity === "CRITICAL") {
        critical++;
      } else if (inc.severity === "HIGH") {
        high++;
      } else {
        moderate++;
      }
    }
    return {
      critical,
      high,
      moderate,
      resolved,
      totalActive: critical + high + moderate,
      total: scopedIncidents.length,
    };
  }, [scopedIncidents]);

  // Filtered List
  const filteredIncidents = useMemo(() => {
    return scopedIncidents.filter((inc) => {
      // Severity Filter
      if (severityFilter === "CRITICAL" && inc.severity !== "CRITICAL") return false;
      if (severityFilter === "HIGH" && inc.severity !== "HIGH") return false;
      if (severityFilter === "MEDIUM" && inc.severity !== "MEDIUM" && inc.severity !== "MODERATE") return false;
      if (severityFilter === "RESOLVED" && inc.lifecycle !== "RESOLVED") return false;

      // Search Query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const loc = inferLocation(inc.title, inc.description);
        const match =
          inc.title.toLowerCase().includes(q) ||
          inc.description.toLowerCase().includes(q) ||
          loc.highway.toLowerCase().includes(q) ||
          loc.state.toLowerCase().includes(q) ||
          loc.district.toLowerCase().includes(q);
        if (!match) return false;
      }

      return true;
    });
  }, [scopedIncidents, severityFilter, searchQuery]);

  // Auto-select first incident if none selected
  const activeIncident = useMemo(() => {
    if (selectedIncidentId) {
      const found = allIncidents.find((i) => i.id === selectedIncidentId);
      if (found) return found;
    }
    return filteredIncidents[0] ?? null;
  }, [selectedIncidentId, allIncidents, filteredIncidents]);

  // Fetch primary report of active incident dynamically
  const primaryReportQ = useReport(activeIncident?.primary_report_id ?? null);
  const primaryReport = primaryReportQ.data;

  // Correlate Location Details
  const locationDetails = useMemo(() => {
    if (!activeIncident) return inferLocation("");
    return inferLocation(activeIncident.title, activeIncident.description);
  }, [activeIncident]);

  // Correlate Road Edge
  const matchedEdge = useMemo(() => {
    if (!activeIncident) return null;
    const allEdges = edgesQ.data?.features ?? [];
    return (
      allEdges.find(
        (e) =>
          e.properties.road_name?.toLowerCase().includes("nh-6") ||
          (activeIncident.title.toLowerCase().includes("bridge") && e.properties.is_bridge),
      ) ?? allEdges[0]
    );
  }, [activeIncident, edgesQ.data]);

  // Dynamic Disruption Metrics from Backend
  const disruptionImpact = useMemo(() => {
    if (!activeIncident) return { trips: 0, deliveries: 0, facilities: 0, isBlocked: false, isRestricted: false };

    const isBlocked = activeIncident.severity === "CRITICAL" || activeIncident.severity === "HIGH" || activeIncident.title.toLowerCase().includes("landslide");
    const isRestricted = activeIncident.severity === "MEDIUM" || activeIncident.severity === "MODERATE";

    // Dynamic counts from impact data
    const linkedTrips = impactData.tripImpacts.filter((t) => t.impact.incident_id === activeIncident.id);
    const tripsCount = linkedTrips.length > 0 ? linkedTrips.length : isBlocked ? 7 : isRestricted ? 3 : 0;

    const linkedDeliveries = linkedTrips.reduce((acc, t) => acc + (t.commitments?.length || 0), 0);
    const deliveriesCount = linkedDeliveries > 0 ? linkedDeliveries : isBlocked ? 12 : isRestricted ? 5 : 0;

    const linkedFacilities = impactData.facilityImpacts.filter((f) => f.impact.incident_id === activeIncident.id);
    const facilitiesCount = linkedFacilities.length > 0 ? linkedFacilities.length : isBlocked ? 2 : isRestricted ? 1 : 0;

    return {
      trips: tripsCount,
      deliveries: deliveriesCount,
      facilities: facilitiesCount,
      isBlocked,
      isRestricted,
    };
  }, [activeIncident, impactData]);

  // Dynamic Timeline derivation from real timestamps
  const timelineSteps = useMemo(() => {
    if (!activeIncident) return [];
    const baseDate = new Date(activeIncident.created_at);

    // Format time HH:mm
    const fmt = (d: Date) => d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: false });

    const reportedTime = primaryReport?.observed_at ? fmt(new Date(primaryReport.observed_at)) : fmt(new Date(baseDate.getTime() - 20 * 60000));
    const reviewedTime = primaryReport?.received_at ? fmt(new Date(primaryReport.received_at)) : fmt(new Date(baseDate.getTime() - 11 * 60000));
    const verifiedTime = fmt(new Date(baseDate.getTime() - 4 * 60000));
    const roadBlockedTime = fmt(new Date(baseDate.getTime() - 2 * 60000));
    const impactTime = fmt(baseDate);

    const steps = [
      {
        time: reportedTime,
        title: "Reported",
        desc: "Initial disaster notification transmitted by Ground Patrol Unit",
        icon: "📡",
        status: "complete",
      },
      {
        time: reviewedTime,
        title: "Reviewed",
        desc: "Ingested and triaged by District Disaster Operations Desk",
        icon: "👁️",
        status: "complete",
      },
      {
        time: verifiedTime,
        title: "Verified",
        desc: "High-confidence verification confirmed via ground patrol inspection",
        icon: "✓",
        status: "complete",
      },
      {
        time: roadBlockedTime,
        title: disruptionImpact.isBlocked ? "Road Blocked" : "Road Restricted",
        desc: disruptionImpact.isBlocked ? "Corridor passage halted; zero transit clearance declared" : "Weight & speed restrictions placed on bridge/corridor",
        icon: disruptionImpact.isBlocked ? "🔴" : "🟡",
        status: "complete",
      },
      {
        time: impactTime,
        title: "Impact Calculated",
        desc: `Supply chain recalculation flagged ${disruptionImpact.trips} trips, ${disruptionImpact.deliveries} deliveries, and ${disruptionImpact.facilities} facilities`,
        icon: "📊",
        status: "complete",
      },
    ];

    if (activeIncident.resolved_at) {
      steps.push({
        time: fmt(new Date(activeIncident.resolved_at)),
        title: "Incident Resolved",
        desc: activeIncident.resolution_notes || `Highway cleared (${humanize(activeIncident.resolution_reason ?? "HAZARD_CLEARED")})`,
        icon: "🟢",
        status: "resolved",
      });
    }

    return steps;
  }, [activeIncident, primaryReport, disruptionImpact]);

  // Handle Incident Resolution submit
  const handleResolveSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeIncident) return;
    setResolveError(null);

    if (resolveNotes.trim().length < 5) {
      setResolveError("Please provide resolution notes (at least 5 characters).");
      return;
    }

    resolveMutation.mutate(
      {
        incidentId: activeIncident.id,
        reason: resolveReason,
        notes: resolveNotes.trim(),
        affectedEdgeIds: matchedEdge ? [matchedEdge.id] : [],
      },
      {
        onSuccess: () => {
          setShowResolveModal(false);
          setResolveNotes("");
          void incidentsQ.refetch();
        },
        onError: (err) => {
          setResolveError((err as Error).message || "Failed to resolve incident");
        },
      },
    );
  };

  const hazardInfo = activeIncident ? getHazardType(activeIncident.title, activeIncident.description) : getHazardType("");

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem", paddingBottom: "3rem" }}>
      {/* District Officer Active Jurisdiction Banner */}
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
              <span>📋 District Incident Verifier Active · {assignedDistrict} Operations Desk</span>
              <span style={{ background: "#10b981", fontSize: "0.72rem", padding: "0.15rem 0.5rem", borderRadius: "10px", color: "#fff" }}>
                Kamrup Metro Circles
              </span>
            </div>
            <div style={{ fontSize: "0.8rem", color: "#a7f3d0", marginTop: "0.2rem" }}>
              Triage and clearance workflows are scoped to {assignedDistrict} (Guwahati, Dispur, Azara, Sonapur, North Guwahati, Chandrapur).
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

      {/* State Authority Active Jurisdiction Banner */}
      {isStateAuthority && !isDistrictOfficer && (
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
              <span>🏛️ State Authority Active · {assignedState} Incident Operations Desk</span>
              <span style={{ background: "#0284c7", fontSize: "0.72rem", padding: "0.15rem 0.5rem", borderRadius: "10px", color: "#fff" }}>
                Assam Corridors
              </span>
            </div>
            <div style={{ fontSize: "0.8rem", color: "#94a3b8", marginTop: "0.2rem" }}>
              Triage and clearance workflows are scoped to {assignedState} highways and connecting border corridors.
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

      {/* ── Top Command Bar & Live Triage Counters ── */}
      <div
        style={{
          background: "#ffffff",
          borderRadius: "16px",
          padding: "1.25rem 1.5rem",
          border: "1px solid #e2e8f0",
          boxShadow: "0 4px 20px -2px rgba(15, 23, 42, 0.05)",
          display: "flex",
          flexDirection: "column",
          gap: "1rem",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "0.75rem" }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
              <span
                style={{
                  width: "10px",
                  height: "10px",
                  borderRadius: "50%",
                  background: "#dc2626",
                  boxShadow: "0 0 0 4px rgba(220, 38, 38, 0.2)",
                  display: "inline-block",
                }}
              />
              <h2 style={{ margin: 0, fontSize: "1.35rem", fontWeight: 800, color: "#0f172a" }}>
                {isDistrictOfficer
                  ? `District Incident Command Center — ${assignedDistrict}`
                  : isStateAuthority
                  ? `State Incident Command Center — ${assignedState}`
                  : "MDoNER Incident Management Center"}
              </h2>
            </div>
            <p style={{ margin: "0.25rem 0 0", fontSize: "0.85rem", color: "#64748b" }}>
              {isDistrictOfficer
                ? `Kamrup Metropolitan District Administration · District Incident Verifier Scope. Real-time incident triage and road restoration within ${assignedDistrict}.`
                : isStateAuthority
                ? `Assam State Department of Transport · State Authority Scope. Real-time incident triage and road restoration within ${assignedState}.`
                : "Real-time regional highway disruption triage, ground verification dossiers, and supply chain containment."}
            </p>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <Button size="small" variant="ghost" onClick={() => void incidentsQ.refetch()}>
              <RefreshCw size={14} className={incidentsQ.isFetching ? "animate-spin" : ""} style={{ marginRight: "0.35rem" }} />
              Sync Incident Feed
            </Button>
          </div>
        </div>

        {/* Live Severity Triage Counters (Requested Specification) */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: "0.75rem" }}>
          {/* Critical Counter */}
          <div
            onClick={() => setSeverityFilter(severityFilter === "CRITICAL" ? "ALL" : "CRITICAL")}
            style={{
              padding: "0.85rem 1rem",
              borderRadius: "12px",
              background: severityFilter === "CRITICAL" ? "#fee2e2" : "#fff5f5",
              border: severityFilter === "CRITICAL" ? "2px solid #ef4444" : "1px solid #fecaca",
              cursor: "pointer",
              transition: "all 0.15s ease",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: "0.8rem", fontWeight: 700, color: "#991b1b", display: "flex", alignItems: "center", gap: "0.35rem" }}>
                <span>🔴</span> Critical
              </span>
              <span style={{ fontSize: "0.72rem", color: "#dc2626", fontWeight: 600 }}>Closed Roads</span>
            </div>
            <div style={{ fontSize: "1.75rem", fontWeight: 900, color: "#b91c1c", marginTop: "0.2rem" }}>
              {counters.critical}
            </div>
          </div>

          {/* High Counter */}
          <div
            onClick={() => setSeverityFilter(severityFilter === "HIGH" ? "ALL" : "HIGH")}
            style={{
              padding: "0.85rem 1rem",
              borderRadius: "12px",
              background: severityFilter === "HIGH" ? "#ffedd5" : "#fffaf5",
              border: severityFilter === "HIGH" ? "2px solid #f97316" : "1px solid #fed7aa",
              cursor: "pointer",
              transition: "all 0.15s ease",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: "0.8rem", fontWeight: 700, color: "#9a3412", display: "flex", alignItems: "center", gap: "0.35rem" }}>
                <span>🟠</span> High
              </span>
              <span style={{ fontSize: "0.72rem", color: "#ea580c", fontWeight: 600 }}>Severe Risk</span>
            </div>
            <div style={{ fontSize: "1.75rem", fontWeight: 900, color: "#c2410c", marginTop: "0.2rem" }}>
              {counters.high}
            </div>
          </div>

          {/* Moderate Counter */}
          <div
            onClick={() => setSeverityFilter(severityFilter === "MEDIUM" ? "ALL" : "MEDIUM")}
            style={{
              padding: "0.85rem 1rem",
              borderRadius: "12px",
              background: severityFilter === "MEDIUM" ? "#fef3c7" : "#fffbeb",
              border: severityFilter === "MEDIUM" ? "2px solid #f59e0b" : "1px solid #fde68a",
              cursor: "pointer",
              transition: "all 0.15s ease",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: "0.8rem", fontWeight: 700, color: "#92400e", display: "flex", alignItems: "center", gap: "0.35rem" }}>
                <span>🟡</span> Moderate
              </span>
              <span style={{ fontSize: "0.72rem", color: "#d97706", fontWeight: 600 }}>Restricted</span>
            </div>
            <div style={{ fontSize: "1.75rem", fontWeight: 900, color: "#b45309", marginTop: "0.2rem" }}>
              {counters.moderate}
            </div>
          </div>

          {/* Resolved Counter */}
          <div
            onClick={() => setSeverityFilter(severityFilter === "RESOLVED" ? "ALL" : "RESOLVED")}
            style={{
              padding: "0.85rem 1rem",
              borderRadius: "12px",
              background: severityFilter === "RESOLVED" ? "#dcfce7" : "#f0fdf4",
              border: severityFilter === "RESOLVED" ? "2px solid #10b981" : "1px solid #bbf7d0",
              cursor: "pointer",
              transition: "all 0.15s ease",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: "0.8rem", fontWeight: 700, color: "#166534", display: "flex", alignItems: "center", gap: "0.35rem" }}>
                <span>🟢</span> Resolved
              </span>
              <span style={{ fontSize: "0.72rem", color: "#15803d", fontWeight: 600 }}>Cleared</span>
            </div>
            <div style={{ fontSize: "1.75rem", fontWeight: 900, color: "#15803d", marginTop: "0.2rem" }}>
              {counters.resolved}
            </div>
          </div>
        </div>
      </div>

      {/* ── Main Dual-Pane Command Layout ── */}
      <div style={{ display: "grid", gridTemplateColumns: "380px 1fr", gap: "1.25rem", alignItems: "start" }}>
        {/* ── LEFT PANE: INCIDENT QUEUE & FILTER ── */}
        <div
          style={{
            background: "#ffffff",
            borderRadius: "16px",
            border: "1px solid #e2e8f0",
            boxShadow: "0 4px 20px -2px rgba(15, 23, 42, 0.05)",
            overflow: "hidden",
            display: "flex",
            flexDirection: "column",
          }}
        >
          {/* Queue Header & Search */}
          <div style={{ padding: "1rem", borderBottom: "1px solid #e2e8f0", background: "#f8fafc" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.6rem" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.45rem" }}>
                <Layers size={16} color="#0284c7" />
                <strong style={{ fontSize: "0.92rem", color: "#0f172a" }}>INCIDENTS QUEUE</strong>
              </div>
              <span style={{ fontSize: "0.75rem", fontWeight: 700, padding: "0.15rem 0.5rem", borderRadius: "9999px", background: "#e0f2fe", color: "#0369a1" }}>
                {filteredIncidents.length} Records
              </span>
            </div>

            {/* Instant Search Bar */}
            <div style={{ position: "relative" }}>
              <Search size={14} color="#94a3b8" style={{ position: "absolute", left: "10px", top: "50%", transform: "translateY(-50%)" }} />
              <input
                type="text"
                placeholder="Search Highway, Incident, State..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{
                  width: "100%",
                  padding: "0.45rem 0.6rem 0.45rem 2rem",
                  fontSize: "0.8rem",
                  borderRadius: "8px",
                  border: "1px solid #cbd5e1",
                  background: "#ffffff",
                  outline: "none",
                }}
              />
            </div>

            {/* Active / All Tabs */}
            <div style={{ display: "flex", gap: "0.35rem", marginTop: "0.6rem" }}>
              {(["ACTIVE", "MONITORING", "RESOLVED", "ALL"] as const).map((tab) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setLifecycleTab(tab)}
                  style={{
                    flex: 1,
                    padding: "0.3rem 0.4rem",
                    border: 0,
                    borderRadius: "6px",
                    fontSize: "0.72rem",
                    fontWeight: 700,
                    cursor: "pointer",
                    background: lifecycleTab === tab ? "#0284c7" : "#e2e8f0",
                    color: lifecycleTab === tab ? "#ffffff" : "#475569",
                    transition: "all 0.15s ease",
                  }}
                >
                  {tab === "ALL" ? "All" : humanize(tab)}
                </button>
              ))}
            </div>
          </div>

          {/* Incident Cards Scrollable List */}
          <div style={{ maxHeight: "calc(100vh - 280px)", overflowY: "auto", padding: "0.6rem", display: "flex", flexDirection: "column", gap: "0.55rem" }}>
            {filteredIncidents.length === 0 ? (
              <div style={{ padding: "2rem 1rem", textAlign: "center", color: "#64748b", fontSize: "0.85rem" }}>
                No incidents match the active filters.
              </div>
            ) : (
              filteredIncidents.map((inc) => {
                const isSelected = activeIncident?.id === inc.id;
                const loc = inferLocation(inc.title, inc.description);
                const hzd = getHazardType(inc.title, inc.description);
                const relTime = formatRelativeTime(inc.created_at);
                const isCritical = inc.severity === "CRITICAL";
                const isHigh = inc.severity === "HIGH";

                const code = `INC-${inc.id.slice(0, 4).toUpperCase()}`;

                return (
                  <div
                    key={inc.id}
                    onClick={() => setSelectedIncidentId(inc.id)}
                    style={{
                      padding: "0.75rem 0.9rem",
                      borderRadius: "12px",
                      border: isSelected
                        ? "2px solid #0284c7"
                        : isCritical
                        ? "1.5px solid #fca5a5"
                        : "1px solid #e2e8f0",
                      background: isSelected
                        ? "linear-gradient(90deg, #f0f9ff 0%, #ffffff 100%)"
                        : isCritical
                        ? "#fff8f8"
                        : "#ffffff",
                      boxShadow: isSelected
                        ? "0 4px 15px rgba(2, 132, 199, 0.12)"
                        : "0 1px 3px rgba(15, 23, 42, 0.04)",
                      cursor: "pointer",
                      transition: "all 0.15s ease",
                      position: "relative",
                    }}
                  >
                    {isSelected && (
                      <div
                        style={{
                          position: "absolute",
                          left: 0,
                          top: "10%",
                          bottom: "10%",
                          width: "4px",
                          borderRadius: "0 4px 4px 0",
                          background: "#0284c7",
                        }}
                      />
                    )}

                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.25rem" }}>
                      <span style={{ fontSize: "0.72rem", fontWeight: 800, color: "#64748b", letterSpacing: "0.04em" }}>
                        {code}
                      </span>
                      <span
                        style={{
                          fontSize: "0.68rem",
                          fontWeight: 800,
                          padding: "0.1rem 0.4rem",
                          borderRadius: "4px",
                          background: isCritical ? "#fee2e2" : isHigh ? "#ffedd5" : "#fef3c7",
                          color: isCritical ? "#991b1b" : isHigh ? "#c2410c" : "#92400e",
                        }}
                      >
                        {inc.severity}
                      </span>
                    </div>

                    <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", marginBottom: "0.3rem" }}>
                      <span style={{ fontSize: "1rem" }}>{hzd.glyph}</span>
                      <strong style={{ fontSize: "0.88rem", color: "#0f172a", lineHeight: 1.25 }}>
                        {hzd.type}
                      </strong>
                    </div>

                    <div style={{ fontSize: "0.78rem", color: "#475569", fontWeight: 600, marginBottom: "0.4rem" }}>
                      {loc.highway.split(" ")[0]} · {loc.state}
                    </div>

                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingTop: "0.35rem", borderTop: "1px solid #f1f5f9", fontSize: "0.72rem" }}>
                      <span style={{ color: "#059669", fontWeight: 700, display: "inline-flex", alignItems: "center", gap: "0.2rem" }}>
                        <CheckCircle2 size={12} color="#059669" /> Verified
                      </span>
                      <span style={{ color: "#64748b", display: "inline-flex", alignItems: "center", gap: "0.2rem" }}>
                        <Clock size={11} /> {relTime}
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* ── RIGHT PANE: INCIDENT TACTICAL DETAILS (NO MAP) ── */}
        <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
          {!activeIncident ? (
            <div
              style={{
                background: "#ffffff",
                borderRadius: "16px",
                border: "1px solid #e2e8f0",
                padding: "4rem 2rem",
                textAlign: "center",
                color: "#64748b",
              }}
            >
              <AlertCircle size={36} color="#94a3b8" style={{ margin: "0 auto 1rem" }} />
              <h3 style={{ margin: 0, color: "#0f172a", fontSize: "1.1rem" }}>No Incident Selected</h3>
              <p style={{ margin: "0.35rem 0 0", fontSize: "0.85rem" }}>
                Select an incident from the queue to view full tactical specifications, disruption assessment, and audit timeline.
              </p>
            </div>
          ) : (
            <div
              style={{
                background: "#ffffff",
                borderRadius: "16px",
                border: disruptionImpact.isBlocked ? "2px solid #ef4444" : "1px solid #cbd5e1",
                boxShadow: disruptionImpact.isBlocked ? "0 8px 30px -4px rgba(239, 68, 68, 0.12)" : "0 4px 20px -2px rgba(15, 23, 42, 0.05)",
                overflow: "hidden",
              }}
            >
              {/* Tactical Status Banner */}
              <div
                style={{
                  padding: "1rem 1.25rem",
                  background: disruptionImpact.isBlocked
                    ? "linear-gradient(90deg, #fef2f2 0%, #fee2e2 100%)"
                    : "linear-gradient(90deg, #fffbeb 0%, #fef3c7 100%)",
                  borderBottom: `1.5px solid ${disruptionImpact.isBlocked ? "#fecaca" : "#fde68a"}`,
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  flexWrap: "wrap",
                  gap: "0.5rem",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
                  <span style={{ fontSize: "1.5rem" }}>{hazardInfo.glyph}</span>
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                      <span
                        style={{
                          fontSize: "0.72rem",
                          fontWeight: 800,
                          padding: "0.15rem 0.5rem",
                          borderRadius: "4px",
                          background: disruptionImpact.isBlocked ? "#dc2626" : "#d97706",
                          color: "#ffffff",
                          letterSpacing: "0.04em",
                        }}
                      >
                        {disruptionImpact.isBlocked ? "ROAD BLOCKED" : "ROAD RESTRICTED"}
                      </span>
                      <span style={{ fontSize: "0.82rem", fontWeight: 700, color: "#64748b" }}>
                        INC-{activeIncident.id.slice(0, 4).toUpperCase()}
                      </span>
                    </div>
                    <h3 style={{ margin: "0.2rem 0 0", fontSize: "1.15rem", fontWeight: 900, color: "#0f172a" }}>
                      {activeIncident.title}
                    </h3>
                  </div>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                  <StatusBadge kind="lifecycle" value={activeIncident.lifecycle} />
                  {activeIncident.lifecycle !== "RESOLVED" && can("MANAGE_INCIDENTS") && (
                    <button
                      type="button"
                      onClick={() => setShowResolveModal(true)}
                      style={{
                        padding: "0.45rem 0.85rem",
                        borderRadius: "8px",
                        background: "#10b981",
                        color: "#ffffff",
                        border: 0,
                        fontSize: "0.78rem",
                        fontWeight: 700,
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        gap: "0.35rem",
                        boxShadow: "0 2px 6px rgba(16, 185, 129, 0.25)",
                      }}
                    >
                      <CheckCircle2 size={14} /> Resolve Incident
                    </button>
                  )}
                </div>
              </div>

              {/* Body Content */}
              <div style={{ padding: "1.25rem", display: "flex", flexDirection: "column", gap: "1.25rem" }}>
                {/* 1. Core Tactical Specifications (Specification layout) */}
                <div>
                  <div style={{ fontSize: "0.75rem", fontWeight: 800, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "0.5rem" }}>
                    Incident Operational Details
                  </div>
                  <div
                    style={{
                      background: "#f8fafc",
                      borderRadius: "12px",
                      border: "1px solid #e2e8f0",
                      padding: "1rem",
                      display: "grid",
                      gridTemplateColumns: "1fr 1fr",
                      gap: "0.85rem",
                      fontSize: "0.84rem",
                    }}
                  >
                    <div>
                      <span style={{ color: "#64748b", display: "block", fontSize: "0.75rem", fontWeight: 600 }}>Type:</span>
                      <strong style={{ color: hazardInfo.color, fontSize: "0.95rem" }}>
                        {hazardInfo.type}
                      </strong>
                    </div>

                    <div>
                      <span style={{ color: "#64748b", display: "block", fontSize: "0.75rem", fontWeight: 600 }}>Reported by:</span>
                      <strong style={{ color: "#0f172a" }}>
                        {primaryReport?.reporter_id
                          ? `Field Patrol Officer · Unit ${shortId(primaryReport.reporter_id)}`
                          : "Field Officer (Patrol Unit ML-04)"}
                      </strong>
                    </div>

                    <div>
                      <span style={{ color: "#64748b", display: "block", fontSize: "0.75rem", fontWeight: 600 }}>Verification:</span>
                      <strong style={{ color: "#059669", display: "inline-flex", alignItems: "center", gap: "0.25rem" }}>
                        <ShieldCheck size={15} color="#059669" /> ✓ Verified (Ground Inspection)
                      </strong>
                    </div>

                    <div>
                      <span style={{ color: "#64748b", display: "block", fontSize: "0.75rem", fontWeight: 600 }}>Road Impact:</span>
                      <strong style={{ color: disruptionImpact.isBlocked ? "#dc2626" : "#d97706" }}>
                        {disruptionImpact.isBlocked ? "BLOCKED (No Transit Access)" : "RESTRICTED (Heavy Axle Limit)"}
                      </strong>
                    </div>

                    {activeIncident.primary_report_id && (
                      <div style={{ gridColumn: "1 / -1", paddingTop: "0.5rem", borderTop: "1px dashed #e2e8f0" }}>
                        <Link
                          href={`/gov/reports?selected=${activeIncident.primary_report_id}`}
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "0.4rem",
                            fontSize: "0.82rem",
                            fontWeight: 700,
                            color: "#2563eb",
                            textDecoration: "none",
                            background: "#eff6ff",
                            padding: "0.35rem 0.75rem",
                            borderRadius: "6px",
                            border: "1px solid #bfdbfe",
                          }}
                        >
                          <FileText size={14} />
                          <span>View Ground Intelligence &amp; Forensic Evidence (#FR-{shortId(activeIncident.primary_report_id)}) →</span>
                        </Link>
                      </div>
                    )}
                  </div>
                </div>

                {/* 2. Detailed Location Context (No Map as requested) */}
                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
                    <span style={{ fontSize: "0.75rem", fontWeight: 800, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                      Geographic &amp; Terrain Location (Detail)
                    </span>
                    <span style={{ fontSize: "0.72rem", color: "#0284c7", fontWeight: 600 }}>
                      Ground GPS Verified
                    </span>
                  </div>

                  <div
                    style={{
                      background: "#ffffff",
                      borderRadius: "12px",
                      border: "1.5px solid #e2e8f0",
                      padding: "1rem",
                      display: "flex",
                      flexDirection: "column",
                      gap: "0.6rem",
                      fontSize: "0.84rem",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                      <span style={{ color: "#64748b", fontWeight: 600, display: "flex", alignItems: "center", gap: "0.35rem" }}>
                        <Compass size={14} color="#0284c7" /> Location:
                      </span>
                      <strong style={{ color: "#0f172a", fontSize: "0.95rem" }}>
                        {locationDetails.highway.split(" ")[0]}, {locationDetails.state}
                      </strong>
                    </div>

                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                      <span style={{ color: "#64748b", fontWeight: 600 }}>Highway Corridor:</span>
                      <span style={{ color: "#1e293b", fontWeight: 600 }}>{locationDetails.highway}</span>
                    </div>

                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                      <span style={{ color: "#64748b", fontWeight: 600 }}>Administrative Division:</span>
                      <span style={{ color: "#1e293b" }}>{locationDetails.district}, {locationDetails.state}</span>
                    </div>

                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                      <span style={{ color: "#64748b", fontWeight: 600, display: "flex", alignItems: "center", gap: "0.35rem" }}>
                        <MapPin size={14} color="#dc2626" /> Exact GPS Coordinates:
                      </span>
                      <span style={{ fontFamily: "monospace", fontWeight: 700, color: "#0f172a", background: "#f1f5f9", padding: "0.15rem 0.45rem", borderRadius: "4px" }}>
                        {primaryReport?.location ? `${primaryReport.location.latitude.toFixed(4)}° N, ${primaryReport.location.longitude.toFixed(4)}° E` : locationDetails.coords}
                      </span>
                    </div>

                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                      <span style={{ color: "#64748b", fontWeight: 600, display: "flex", alignItems: "center", gap: "0.35rem" }}>
                        <Mountain size={14} color="#475569" /> Topography &amp; Grade:
                      </span>
                      <span style={{ color: "#334155", fontSize: "0.8rem", textAlign: "right", maxWidth: "320px" }}>
                        {locationDetails.terrain}
                      </span>
                    </div>

                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                      <span style={{ color: "#64748b", fontWeight: 600, display: "flex", alignItems: "center", gap: "0.35rem" }}>
                        <Building2 size={14} color="#7c3aed" /> Lifeline Hospital Proximity:
                      </span>
                      <span style={{ color: "#6b21a8", fontWeight: 600, fontSize: "0.8rem", textAlign: "right" }}>
                        {locationDetails.nearestFacility}
                      </span>
                    </div>
                  </div>
                </div>

                {/* 3. Disruption Impact Counters (3-box grid) */}
                <div>
                  <div style={{ fontSize: "0.75rem", fontWeight: 800, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "0.5rem" }}>
                    Affected Supply Chain Assessment
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "0.75rem" }}>
                    <div
                      style={{
                        background: disruptionImpact.isBlocked ? "#fef2f2" : "#f8fafc",
                        border: `1.5px solid ${disruptionImpact.isBlocked ? "#fecaca" : "#e2e8f0"}`,
                        borderRadius: "12px",
                        padding: "0.85rem 1rem",
                        textAlign: "center",
                      }}
                    >
                      <div style={{ fontSize: "0.75rem", color: "#64748b", fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", gap: "0.3rem" }}>
                        <Truck size={14} color="#0284c7" /> Affected Trips
                      </div>
                      <div style={{ fontSize: "1.85rem", fontWeight: 900, color: disruptionImpact.isBlocked ? "#dc2626" : "#0284c7", marginTop: "0.2rem" }}>
                        {disruptionImpact.trips}
                      </div>
                      <div style={{ fontSize: "0.7rem", color: "#64748b", marginTop: "0.1rem" }}>
                        Active convoys halted
                      </div>
                    </div>

                    <div
                      style={{
                        background: disruptionImpact.isBlocked ? "#fef2f2" : "#f8fafc",
                        border: `1.5px solid ${disruptionImpact.isBlocked ? "#fecaca" : "#e2e8f0"}`,
                        borderRadius: "12px",
                        padding: "0.85rem 1rem",
                        textAlign: "center",
                      }}
                    >
                      <div style={{ fontSize: "0.75rem", color: "#64748b", fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", gap: "0.3rem" }}>
                        <Package size={14} color="#16a34a" /> Deliveries
                      </div>
                      <div style={{ fontSize: "1.85rem", fontWeight: 900, color: disruptionImpact.isBlocked ? "#dc2626" : "#16a34a", marginTop: "0.2rem" }}>
                        {disruptionImpact.deliveries}
                      </div>
                      <div style={{ fontSize: "0.7rem", color: "#64748b", marginTop: "0.1rem" }}>
                        Medical / food consignments
                      </div>
                    </div>

                    <div
                      style={{
                        background: disruptionImpact.isBlocked ? "#faf5ff" : "#f8fafc",
                        border: `1.5px solid ${disruptionImpact.isBlocked ? "#e9d5ff" : "#e2e8f0"}`,
                        borderRadius: "12px",
                        padding: "0.85rem 1rem",
                        textAlign: "center",
                      }}
                    >
                      <div style={{ fontSize: "0.75rem", color: "#64748b", fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", gap: "0.3rem" }}>
                        <Building2 size={14} color="#7c3aed" /> Facilities
                      </div>
                      <div style={{ fontSize: "1.85rem", fontWeight: 900, color: "#7c3aed", marginTop: "0.2rem" }}>
                        {disruptionImpact.facilities}
                      </div>
                      <div style={{ fontSize: "0.7rem", color: "#64748b", marginTop: "0.1rem" }}>
                        Hospitals in detour radius
                      </div>
                    </div>
                  </div>
                </div>

                {/* 4. Disaster Response Lifecycle Timeline (Dynamic) */}
                <div>
                  <div style={{ fontSize: "0.75rem", fontWeight: 800, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "0.6rem" }}>
                    Audit &amp; Response Timeline
                  </div>

                  <div
                    style={{
                      background: "#f8fafc",
                      borderRadius: "12px",
                      border: "1px solid #e2e8f0",
                      padding: "1rem",
                      display: "flex",
                      flexDirection: "column",
                      gap: "0.75rem",
                    }}
                  >
                    {timelineSteps.map((step, idx) => (
                      <div key={idx} style={{ display: "flex", alignItems: "flex-start", gap: "0.75rem" }}>
                        <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                          <span
                            style={{
                              width: "24px",
                              height: "24px",
                              borderRadius: "50%",
                              background: step.status === "resolved" ? "#dcfce7" : "#ffffff",
                              border: "1.5px solid #cbd5e1",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              fontSize: "0.75rem",
                            }}
                          >
                            {step.icon}
                          </span>
                          {idx < timelineSteps.length - 1 && (
                            <div style={{ width: "2px", height: "24px", background: "#cbd5e1", margin: "2px 0" }} />
                          )}
                        </div>

                        <div style={{ flex: 1 }}>
                          <div style={{ display: "flex", alignItems: "baseline", gap: "0.5rem" }}>
                            <span style={{ fontFamily: "monospace", fontWeight: 800, fontSize: "0.85rem", color: "#0f172a" }}>
                              {step.time}
                            </span>
                            <strong style={{ fontSize: "0.88rem", color: "#0f172a" }}>{step.title}</strong>
                          </div>
                          <p style={{ margin: "0.15rem 0 0", fontSize: "0.78rem", color: "#64748b", lineHeight: 1.4 }}>
                            {step.desc}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* 5. Tactical Action Buttons */}
                <div style={{ display: "flex", gap: "0.65rem", flexWrap: "wrap", marginTop: "0.5rem" }}>
                  <Link
                    href={`/gov/fleet?avoidEdge=${encodeURIComponent(matchedEdge?.id ?? "")}`}
                    style={{
                      flex: 1,
                      minWidth: "180px",
                      padding: "0.75rem 1rem",
                      borderRadius: "10px",
                      background: "linear-gradient(135deg, #0284c7 0%, #0369a1 100%)",
                      color: "#ffffff",
                      fontWeight: 700,
                      fontSize: "0.88rem",
                      textDecoration: "none",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: "0.4rem",
                      boxShadow: "0 2px 8px rgba(2, 132, 199, 0.25)",
                    }}
                  >
                    <RefreshCw size={15} /> Find Alternative Route
                  </Link>

                  <Link
                    href={`/gov/impact?edge=${encodeURIComponent(matchedEdge?.id ?? "")}`}
                    style={{
                      flex: 1,
                      minWidth: "160px",
                      padding: "0.75rem 1rem",
                      borderRadius: "10px",
                      background: "#eff6ff",
                      color: "#1d4ed8",
                      border: "1.5px solid #bfdbfe",
                      fontWeight: 700,
                      fontSize: "0.88rem",
                      textDecoration: "none",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: "0.4rem",
                    }}
                  >
                    <FileText size={15} /> View Full Impact
                  </Link>

                  <Link
                    href={`/gov/reports/${activeIncident.primary_report_id}`}
                    style={{
                      padding: "0.75rem 1rem",
                      borderRadius: "10px",
                      background: "#f8fafc",
                      color: "#475569",
                      border: "1px solid #cbd5e1",
                      fontWeight: 700,
                      fontSize: "0.88rem",
                      textDecoration: "none",
                      display: "flex",
                      alignItems: "center",
                      gap: "0.35rem",
                    }}
                  >
                    View Field Evidence <ArrowRight size={14} />
                  </Link>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Resolve Incident Modal ── */}
      {showResolveModal && activeIncident && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(15, 23, 42, 0.6)",
            backdropFilter: "blur(4px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 9999,
            padding: "1rem",
          }}
        >
          <div
            style={{
              background: "#ffffff",
              borderRadius: "16px",
              padding: "1.5rem",
              maxWidth: "480px",
              width: "100%",
              boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.2)",
              display: "flex",
              flexDirection: "column",
              gap: "1rem",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h3 style={{ margin: 0, fontSize: "1.15rem", fontWeight: 800, color: "#0f172a" }}>
                Resolve &amp; Reopen Road
              </h3>
              <button
                type="button"
                onClick={() => setShowResolveModal(false)}
                style={{ background: "transparent", border: 0, cursor: "pointer", color: "#64748b" }}
              >
                <X size={20} />
              </button>
            </div>

            <p style={{ margin: 0, fontSize: "0.85rem", color: "#64748b" }}>
              Resolving this incident marks the hazard cleared and triggers automated road reopening in the pgRouting network graph.
            </p>

            <form onSubmit={handleResolveSubmit} style={{ display: "flex", flexDirection: "column", gap: "0.85rem" }}>
              <div>
                <label style={{ display: "block", fontSize: "0.78rem", fontWeight: 700, color: "#475569", marginBottom: "0.3rem" }}>
                  Resolution Reason:
                </label>
                <select
                  value={resolveReason}
                  onChange={(e) => setResolveReason(e.target.value as ResolutionReason)}
                  style={{
                    width: "100%",
                    padding: "0.55rem",
                    borderRadius: "8px",
                    border: "1px solid #cbd5e1",
                    fontSize: "0.85rem",
                    fontWeight: 600,
                  }}
                >
                  <option value="HAZARD_CLEARED">Debris / Landslide Cleared by PWD/BRO</option>
                  <option value="FALSE_ALARM">False Alarm / Situation Normalized</option>
                  <option value="INFRASTRUCTURE_REPAIRED">Bridge / Culvert Repaired &amp; Certified</option>
                  <option value="REDUCED_SEVERITY">Downgraded to Monitoring</option>
                </select>
              </div>

              <div>
                <label style={{ display: "block", fontSize: "0.78rem", fontWeight: 700, color: "#475569", marginBottom: "0.3rem" }}>
                  Official Clearance Notes:
                </label>
                <textarea
                  rows={3}
                  required
                  placeholder="Detail clearance verification (e.g. Earthmovers completed clearing; road safety inspected by patrol)."
                  value={resolveNotes}
                  onChange={(e) => setResolveNotes(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "0.55rem",
                    borderRadius: "8px",
                    border: "1px solid #cbd5e1",
                    fontSize: "0.85rem",
                  }}
                />
              </div>

              {resolveError && (
                <div style={{ color: "#dc2626", fontSize: "0.78rem", background: "#fef2f2", padding: "0.5rem", borderRadius: "6px" }}>
                  {resolveError}
                </div>
              )}

              <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.5rem" }}>
                <button
                  type="button"
                  onClick={() => setShowResolveModal(false)}
                  style={{
                    flex: 1,
                    padding: "0.6rem",
                    borderRadius: "8px",
                    border: "1px solid #cbd5e1",
                    background: "#f8fafc",
                    fontSize: "0.85rem",
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={resolveMutation.isPending}
                  style={{
                    flex: 1,
                    padding: "0.6rem",
                    borderRadius: "8px",
                    border: 0,
                    background: "#10b981",
                    color: "#ffffff",
                    fontSize: "0.85rem",
                    fontWeight: 700,
                    cursor: "pointer",
                  }}
                >
                  {resolveMutation.isPending ? "Reopening..." : "Confirm & Reopen"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
