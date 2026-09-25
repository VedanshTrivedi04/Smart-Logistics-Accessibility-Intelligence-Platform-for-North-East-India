
"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  api,
  unwrap,
  REPORT_SEVERITIES,
  REPORT_TYPES,
  type ReportSeverity,
  type ReportType,
  type LaneStatus,
  type PassableVehicleClass,
} from "@/shared/api";
import { usePrincipal, useSession } from "@/shared/auth";
import { formatCoords, humanize } from "@/shared/lib/format";
import { bboxAround, formatDistance, haversineMeters, isValidLatLon } from "@/shared/lib/geo";
import { formatDateTime } from "@/shared/lib/time";
import { MapLegend, MapView } from "@/shared/map";
import {
  CORRIDOR_MILESTONES,
  snapToCorridor,
  type CorridorMilestone,
  type CorridorSnapResult,
} from "@/shared/lib/corridors";
import { StorageStatusPanel } from "./SyncQueue";
import { Banner, Button, Card, Field, StatusBadge, useAnnounce } from "@/shared/ui";
import { edgeLabel, useEdges } from "@/features/network";
import { emptyPayload, MAX_PHOTOS, validatePayload, type ReportPayload } from "./model";
import { requestBackgroundSync, useOffline } from "./OfflineProvider";
import { addMedia, getDraft, listMedia, newDraft, queueDraft, removeMedia, saveDraft } from "./store";
import { prepareImage } from "./sync/media";
import { useGeolocation } from "./useGeolocation";
import { StorageFullError } from "./store";
import { VoiceReportSection } from "./VoiceReportSection";
import { PhotoHazardPreview } from "./PhotoHazardPreview";

const STEPS = ["What happened", "Where", "Evidence", "Passability & Severity", "Review and save"] as const;

interface TypeConfig {
  label: string;
  icon: string;
  hint: string;
  color: string;
  border: string;
  badge: string;
}

const TYPE_CONFIG: Record<ReportType, TypeConfig> = {
  LANDSLIDE: {
    label: "Landslide",
    icon: "🪨",
    hint: "Earth, rockfall, or mudflow blocking corridor",
    color: "#b45309",
    border: "#f59e0b",
    badge: "High Mountain Risk",
  },
  FLOODING: {
    label: "Flash Flood / Water",
    icon: "🌊",
    hint: "Water over tarmac, culvert overflow, river breach",
    color: "#0369a1",
    border: "#0ea5e9",
    badge: "Monsoon Hazard",
  },
  ROAD_DAMAGE: {
    label: "Road Damage",
    icon: "🛣️",
    hint: "Crater, road subsidence, tarmac washaway",
    color: "#d97706",
    border: "#f59e0b",
    badge: "Passability Risk",
  },
  BRIDGE_COLLAPSE: {
    label: "Bridge Damage",
    icon: "🌉",
    hint: "Structural crack, pier or abutment displacement",
    color: "#dc2626",
    border: "#ef4444",
    badge: "Critical Asset",
  },
  TREE_FALL: {
    label: "Fallen Tree / Debris",
    icon: "🌲",
    hint: "Trees, heavy branches, or utility lines on road",
    color: "#15803d",
    border: "#22c55e",
    badge: "Clearance Needed",
  },
  OBSTRUCTION: {
    label: "Full Obstruction",
    icon: "🛑",
    hint: "Stalled convoy, heavy gridlock, total blockage",
    color: "#991b1b",
    border: "#f87171",
    badge: "Route Jam",
  },
  WEATHER_HAZARD: {
    label: "Severe Weather",
    icon: "⚠️",
    hint: "Dense mountain fog, blinding rain, zero visibility",
    color: "#475569",
    border: "#94a3b8",
    badge: "Visibility Alert",
  },
  SECURITY_INCIDENT: {
    label: "Security Incident",
    icon: "🛡️",
    hint: "Route unrest, checkpoint lockdown, protest",
    color: "#7c3aed",
    border: "#a855f7",
    badge: "Escort Alert",
  },
  OTHER: {
    label: "Other Hazard",
    icon: "❓",
    hint: "Uncategorized physical impediment on route",
    color: "#64748b",
    border: "#cbd5e1",
    badge: "General Observation",
  },
};

const SEVERITY_CONFIG: Record<
  ReportSeverity,
  { label: string; icon: string; hint: string; color: string; bg: string; border: string }
> = {
  LOW: {
    label: "Low Severity",
    icon: "🟢",
    hint: "Passable with caution; minor shoulder or verge problem",
    color: "#15803d",
    bg: "#f0fdf4",
    border: "#86efac",
  },
  MEDIUM: {
    label: "Medium Severity",
    icon: "🟡",
    hint: "Traffic slowed significantly; severe driver caution needed",
    color: "#b45309",
    bg: "#fefce8",
    border: "#fde047",
  },
  HIGH: {
    label: "High Severity",
    icon: "🟠",
    hint: "Severe disruption; heavy freight trucks (20T+) cannot pass",
    color: "#c2410c",
    bg: "#fff7ed",
    border: "#fdba74",
  },
  CRITICAL: {
    label: "Critical (Impassable)",
    icon: "🔴",
    hint: "100% Impassable or lives/cargo at imminent risk",
    color: "#b91c1c",
    bg: "#fef2f2",
    border: "#fca5a5",
  },
};

const LANE_STATUS_CONFIG: Record<
  "BOTH_BLOCKED" | "SINGLE_LANE_OPEN" | "SHOULDER_ONLY" | "CLEAR",
  { label: string; icon: string; hint: string }
> = {
  BOTH_BLOCKED: {
    label: "Both Lanes Blocked",
    icon: "⛔",
    hint: "Total corridor cut-off; zero vehicular movement",
  },
  SINGLE_LANE_OPEN: {
    label: "Single Lane Open",
    icon: "🔄",
    hint: "Alternating single-file flow; patrol control required",
  },
  SHOULDER_ONLY: {
    label: "Shoulder Only",
    icon: "⚠️",
    hint: "Main carriageway blocked; slow shoulder crawl only",
  },
  CLEAR: {
    label: "Carriageway Clear",
    icon: "✅",
    hint: "Hazard is off travel lanes; both directions flow",
  },
};

const VEHICLE_CLASS_OPTIONS = [
  { id: "HEAVY_TRUCK" as const, label: "Heavy Freight Trucks (20T+ multi-axle)", icon: "🚛" },
  { id: "LIGHT_4X4" as const, label: "Light 4x4 / Pickups & SUVs", icon: "🚙" },
  { id: "EMERGENCY_ONLY" as const, label: "Ambulances & Rescue Convoys Only", icon: "🚑" },
  { id: "NONE" as const, label: "No Vehicles (Zero Passage)", icon: "🚫" },
];

function LocationStep({
  payload,
  set,
  draftId,
}: {
  payload: ReportPayload;
  set: (p: Partial<ReportPayload>) => void;
  draftId: string;
}) {
  const geo = useGeolocation();
  const [lat, setLat] = useState("");
  const [lon, setLon] = useState("");
  const [acc, setAcc] = useState("100");
  const [manualError, setManualError] = useState<string | null>(null);
  const [showMilestonePicker, setShowMilestonePicker] = useState(false);

  const loc = payload.location;
  const bbox = useMemo(() => (loc ? bboxAround(loc.latitude, loc.longitude, 400) : null), [loc]);
  const edges = useEdges(bbox, 15, Boolean(bbox));

  const snappedCorridor: CorridorSnapResult | null = useMemo(() => {
    if (!loc) return null;
    return snapToCorridor(loc.latitude, loc.longitude);
  }, [loc]);

  // Warn about a likely duplicate: a same-type report still open, close by, and recent.
  const { scope } = useSession();
  const activeReports = useQuery({
    queryKey: [...scope, "reports", "nearby-check"],
    queryFn: () => unwrap(() => api.GET("/api/v1/reports", { params: { query: { limit: 50 } } })),
    staleTime: 60_000,
    retry: false,
  });

  const recentReports = activeReports.data;
  const nearbyDuplicate = useMemo(() => {
    if (!loc || !payload.reportType || !recentReports) return null;
    const cutoff = Date.now() - 24 * 3_600_000;
    let best: { rep: (typeof recentReports)[number]; distanceMeters: number } | null = null;
    for (const rep of recentReports) {
      if (rep.report_type !== payload.reportType || rep.review_state === "REJECTED") continue;
      if (new Date(rep.observed_at).getTime() < cutoff) continue;
      const d = haversineMeters(loc.latitude, loc.longitude, rep.location.latitude, rep.location.longitude);
      if (d <= 1500 && (!best || d < best.distanceMeters)) best = { rep, distanceMeters: Math.round(d) };
    }
    return best;
  }, [loc, payload.reportType, recentReports]);

  const nearby = useMemo(() => {
    if (!loc) return [];
    return (edges.data?.features ?? [])
      .map((f) => ({
        f,
        d: Math.min(...f.coordinates.map(([x, y]) => haversineMeters(loc.latitude, loc.longitude, y, x))),
      }))
      .sort((a, b) => a.d - b.d)
      .slice(0, 8);
  }, [edges.data, loc]);

  useEffect(() => {
    if (geo.state.status === "ok") {
      const f = geo.state.fix;
      set({
        location: {
          latitude: f.latitude,
          longitude: f.longitude,
          accuracy_m: f.accuracy_m,
          location_provider: "GPS_HARDWARE",
          altitude_m: f.altitude_m,
        },
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [geo.state]);

  const applyManual = () => {
    const la = Number(lat);
    const lo = Number(lon);
    const ac = Number(acc);
    if (!isValidLatLon(la, lo) || lat.trim() === "" || lon.trim() === "") {
      return setManualError("Enter a latitude between −90 and 90 and a longitude between −180 and 180.");
    }
    if (!(ac > 0 && ac <= 5000)) {
      return setManualError("Accuracy must be between 1 and 5000 metres.");
    }
    setManualError(null);
    set({
      location: {
        latitude: la,
        longitude: lo,
        accuracy_m: ac,
        location_provider: "MANUAL_MAP_PICK",
      },
    });
  };

  const selectMilestone = (m: CorridorMilestone) => {
    set({
      location: {
        latitude: m.lat,
        longitude: m.lon,
        accuracy_m: 500, // Honest accuracy rating for manual milestone reference
        location_provider: "MANUAL_MAP_PICK",
      },
    });
    setShowMilestonePicker(false);
  };

  const locationPoints = loc
    ? [{ id: draftId, kind: "report" as const, lon: loc.longitude, lat: loc.latitude, label: "Report location", tone: "warn" as const }]
    : [];

  return (
    <div className="stack" style={{ gap: "1.2rem" }}>
      {/* Primary GPS Hardware Button */}
      <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
        <Button
          size="large"
          variant="primary"
          onClick={geo.locate}
          busy={geo.state.status === "locating"}
          style={{ padding: "0.85rem 1.25rem", fontSize: "0.95rem", fontWeight: 700 }}
        >
          📍 Acquire Hardware GPS Position
        </Button>
        {geo.state.status === "denied" || geo.state.status === "unavailable" || geo.state.status === "timeout" ? (
          <Banner tone="warn" title="Could not get GPS fix">
            <p className="small">{geo.state.message}. Use the milestone fallback picker or manual coordinates below.</p>
          </Banner>
        ) : null}
      </div>

      {/* Corridor Chainage Card */}
      {loc && (
        <div
          style={{
            background: "#f8fafc",
            border: "1.5px solid #cbd5e1",
            borderRadius: "12px",
            padding: "0.9rem 1rem",
            boxShadow: "0 2px 8px rgba(15, 23, 42, 0.05)",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "0.5rem" }}>
            <div>
              <div style={{ fontSize: "0.72rem", fontWeight: 800, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.04em" }}>
                Verified Corridor Snapping
              </div>
              <div style={{ fontSize: "1.25rem", fontWeight: 900, color: "#0f172a", marginTop: "0.15rem" }}>
                {snappedCorridor ? snappedCorridor.formattedChainage : "Off Designated Lifeline Corridor"}
              </div>
              <div style={{ fontSize: "0.82rem", fontWeight: 700, color: "#0369a1", marginTop: "0.2rem" }}>
                Near {snappedCorridor?.nearestMilestone}
              </div>
            </div>
            <span
              style={{
                fontSize: "0.72rem",
                fontWeight: 700,
                padding: "0.25rem 0.6rem",
                borderRadius: "6px",
                background: loc.accuracy_m <= 15 ? "#dcfce7" : loc.accuracy_m <= 100 ? "#fef3c7" : "#fee2e2",
                color: loc.accuracy_m <= 15 ? "#15803d" : loc.accuracy_m <= 100 ? "#b45309" : "#b91c1c",
                border: `1px solid ${loc.accuracy_m <= 15 ? "#86efac" : loc.accuracy_m <= 100 ? "#fde047" : "#fca5a5"}`,
              }}
            >
              ±{Math.round(loc.accuracy_m)}m Accuracy · {humanize(loc.location_provider)}
            </span>
          </div>

          <div style={{ fontSize: "0.76rem", color: "#64748b", marginTop: "0.5rem", borderTop: "1px dashed #e2e8f0", paddingTop: "0.45rem" }}>
            <span>{formatCoords(loc.latitude, loc.longitude)}</span>
            {snappedCorridor && (
              <span style={{ marginLeft: "0.6rem", color: snappedCorridor.isWithinCorridor ? "#16a34a" : "#b45309", fontWeight: 600 }}>
                {snappedCorridor.isWithinCorridor
                  ? `✓ On corridor centerline (±${Math.round(snappedCorridor.offCorridorM)}m offset)`
                  : `⚠️ ${Math.round(snappedCorridor.offCorridorM)}m offset from corridor axis`}
              </span>
            )}
          </div>
        </div>
      )}

      {/* Duplicate Incident Warning Banner */}
      {nearbyDuplicate && (
        <div
          style={{
            background: "#fffbeb",
            border: "1.5px solid #fcd34d",
            borderRadius: "10px",
            padding: "0.8rem 1rem",
            display: "flex",
            alignItems: "flex-start",
            gap: "0.6rem",
          }}
        >
          <span style={{ fontSize: "1.2rem", flexShrink: 0 }}>⚠️</span>
          <div>
            <div style={{ fontWeight: 800, fontSize: "0.88rem", color: "#92400e" }}>
              Active Incident Reported Nearby ({nearbyDuplicate.distanceMeters}m away)
            </div>
            <div style={{ fontSize: "0.78rem", color: "#b45309", marginTop: "0.2rem" }}>
              A {humanize(nearbyDuplicate.rep.report_type ?? "Hazard")} is already logged near this highway sector.
              If this is the same event, add photos or clarify in notes to prevent duplicate alerts in Government Triage.
            </div>
          </div>
        </div>
      )}

      {/* Milestone Fallback Picker */}
      <div style={{ background: "#f8fafc", padding: "0.85rem 1rem", borderRadius: "10px", border: "1px solid #e2e8f0" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: "0.85rem", color: "#1e293b" }}>Mountain Valley / Tunnel Fallback</div>
            <div style={{ fontSize: "0.74rem", color: "#64748b" }}>If GPS is blocked by mountain ridges, snap directly to a verified highway landmark</div>
          </div>
          <Button size="small" variant="default" onClick={() => setShowMilestonePicker(!showMilestonePicker)}>
            {showMilestonePicker ? "Close List" : "Select Milestone"}
          </Button>
        </div>

        {showMilestonePicker && (
          <div style={{ marginTop: "0.8rem", display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: "0.45rem", maxHeight: "240px", overflowY: "auto", borderTop: "1px solid #e2e8f0", paddingTop: "0.6rem" }}>
            {CORRIDOR_MILESTONES.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => selectMilestone(m)}
                style={{
                  background: "#ffffff",
                  border: "1px solid #cbd5e1",
                  borderRadius: "7px",
                  padding: "0.45rem 0.65rem",
                  textAlign: "left",
                  cursor: "pointer",
                  fontSize: "0.76rem",
                }}
              >
                <div style={{ fontWeight: 700, color: "#0f172a" }}>{m.name}</div>
                <div style={{ fontSize: "0.7rem", color: "#0284c7" }}>{m.corridor} · Km {m.chainageKm.toFixed(1)}</div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Interactive Map & Coordinate Entry */}
      <div>
        <p className="small muted" style={{ marginBottom: "0.4rem" }}>
          Tap on the mountain map to pinpoint the exact obstruction point:
        </p>
        <MapView
          ariaLabel="Pick the report location"
          height={260}
          points={locationPoints}
          onMapClick={(lo, la) =>
            set({
              location: {
                latitude: la,
                longitude: lo,
                accuracy_m: Math.max(loc?.accuracy_m ?? 50, 50),
                location_provider: "MANUAL_MAP_PICK",
              },
            })
          }
          fitBounds={bbox}
          fitKey={loc ? `${loc.latitude.toFixed(4)}${loc.longitude.toFixed(4)}` : "none"}
        />
        <MapLegend points={locationPoints} />
      </div>

      {/* Manual Coordinate Form */}
      <fieldset style={{ border: "1px solid #e2e8f0", borderRadius: "10px", padding: "0.85rem 1rem" }}>
        <legend style={{ fontSize: "0.78rem", fontWeight: 700, color: "#64748b", padding: "0 0.4rem" }}>Or enter coordinates manually</legend>
        <div className="grid cols-3" style={{ gap: "0.6rem" }}>
          <Field label="Latitude" htmlFor="m-lat">
            <input id="m-lat" inputMode="decimal" placeholder="e.g. 26.085" value={lat} onChange={(e) => setLat(e.target.value)} />
          </Field>
          <Field label="Longitude" htmlFor="m-lon">
            <input id="m-lon" inputMode="decimal" placeholder="e.g. 91.865" value={lon} onChange={(e) => setLon(e.target.value)} />
          </Field>
          <Field label="Accuracy (m)" htmlFor="m-acc" hint="Estimated error margin">
            <input id="m-acc" inputMode="numeric" value={acc} onChange={(e) => setAcc(e.target.value)} />
          </Field>
        </div>
        {manualError ? <p className="error" role="alert" style={{ marginTop: "0.4rem" }}>{manualError}</p> : null}
        <Button size="small" onClick={applyManual} style={{ marginTop: "0.5rem" }}>Apply Coordinates</Button>
      </fieldset>

      {/* Nearest Road Edges */}
      {loc && (nearby.length > 0 || edges.isError) ? (
        <fieldset style={{ border: "1px solid #e2e8f0", borderRadius: "10px", padding: "0.85rem 1rem" }}>
          <legend style={{ fontSize: "0.78rem", fontWeight: 700, color: "#64748b", padding: "0 0.4rem" }}>Candidate Road Edge</legend>
          {edges.isError ? <p className="small muted">Road names need network connectivity. A reviewer will verify the edge.</p> : null}
          <div className="choice-grid">
            <label className="choice">
              <input type="radio" name="edge" checked={payload.candidateEdgeId === null} onChange={() => set({ candidateEdgeId: null })} />
              <span>Auto-detect via corridor snapping</span>
            </label>
            {nearby.map(({ f, d }) => (
              <label key={f.id} className="choice">
                <input type="radio" name="edge" checked={payload.candidateEdgeId === f.id} onChange={() => set({ candidateEdgeId: f.id })} />
                <span>{edgeLabel(f)}<span className="small muted"> · {formatDistance(d)}</span></span>
              </label>
            ))}
          </div>
        </fieldset>
      ) : null}
    </div>
  );
}

function createSimulatedIncidentPhoto(
  type: string | null | undefined,
  location?: { latitude: number; longitude: number; accuracy_m?: number } | null
): Promise<File> {
  return new Promise((resolve) => {
    const canvas = document.createElement("canvas");
    canvas.width = 640;
    canvas.height = 480;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      resolve(new File(["empty"], "simulated_incident.jpg", { type: "image/jpeg" }));
      return;
    }
    // Deep mountain dark gradient
    const grad = ctx.createLinearGradient(0, 0, 640, 480);
    grad.addColorStop(0, "#091e3a");
    grad.addColorStop(0.5, "#1e293b");
    grad.addColorStop(1, "#334155");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 640, 480);

    // Hazard caution diagonal stripes on top banner
    for (let i = 0; i < 640; i += 32) {
      ctx.fillStyle = "#eab308";
      ctx.beginPath();
      ctx.moveTo(i, 0);
      ctx.lineTo(i + 16, 0);
      ctx.lineTo(i, 18);
      ctx.fill();

      ctx.fillStyle = "#18181b";
      ctx.beginPath();
      ctx.moveTo(i + 16, 0);
      ctx.lineTo(i + 32, 0);
      ctx.lineTo(i + 16, 18);
      ctx.fill();
    }

    // Border
    ctx.strokeStyle = "#38bdf8";
    ctx.lineWidth = 3;
    ctx.strokeRect(8, 8, 624, 464);

    // Bold, Unmissable RED SIMULATION WATERMARK across the image
    ctx.save();
    ctx.translate(320, 240);
    ctx.rotate(-Math.PI / 6);
    ctx.fillStyle = "rgba(220, 38, 38, 0.45)";
    ctx.font = "900 32px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("⚠️ DEMO SIMULATION · NOT EVIDENCE", 0, -20);
    ctx.font = "700 16px monospace";
    ctx.fillText("DEVELOPMENT HARDWARE TEST RECORD", 0, 15);
    ctx.restore();

    // Title banner
    ctx.fillStyle = "#0369a1";
    ctx.fillRect(16, 26, 608, 36);
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 14px monospace";
    ctx.fillText("PARVA NER · DISASTER & ACCESSIBILITY TELEMETRY", 28, 50);

    // Incident details
    ctx.fillStyle = "#f8fafc";
    ctx.font = "bold 20px sans-serif";
    ctx.fillText(`INCIDENT: ${(type || "ROAD HAZARD").replace(/_/g, " ")}`, 28, 105);

    ctx.fillStyle = "#94a3b8";
    ctx.font = "14px monospace";
    const coordStr = location
      ? `GPS FIX: ${location.latitude.toFixed(5)}°N, ${location.longitude.toFixed(5)}°E (±${Math.round(location.accuracy_m ?? 50)}m)`
      : "GPS FIX: 26.08500°N, 91.86500°E (NH-6 / NH-27 Corridor)";
    ctx.fillText(coordStr, 28, 140);
    ctx.fillText(`TIMESTAMP: ${new Date().toISOString()}`, 28, 168);
    ctx.fillText("CAPTURE SOURCE: DEV SIMULATED HARDWARE CAM", 28, 196);

    // Terrain visual silhouette
    ctx.strokeStyle = "#f59e0b";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(20, 390);
    ctx.lineTo(120, 280);
    ctx.lineTo(210, 330);
    ctx.lineTo(340, 240);
    ctx.lineTo(470, 350);
    ctx.lineTo(620, 290);
    ctx.stroke();

    ctx.fillStyle = "#f59e0b";
    ctx.font = "bold 13px sans-serif";
    ctx.fillText("⚠️ HAZARD SECTOR VISUAL RECORD", 28, 380);

    ctx.fillStyle = "rgba(255, 255, 255, 0.5)";
    ctx.font = "11px monospace";
    ctx.fillText("DEV SIMULATION · NOT EVIDENCE", 28, 445);

    canvas.toBlob((blob) => {
      const file = new File([blob || new Blob()], `SIMULATED_DEMO_incident_${Date.now()}.jpg`, { type: "image/jpeg" });
      resolve(file);
    }, "image/jpeg", 0.88);
  });
}

function EvidenceStep({
  payload,
  set,
  draftId,
}: {
  payload: ReportPayload;
  set: (p: Partial<ReportPayload>) => void;
  draftId: string;
}) {
  const { db, ownerId, orgId, ready } = useOffline();
  const [photos, setPhotos] = useState<Array<{ id: string; url: string; name: string; size: number }>>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [latestFile, setLatestFile] = useState<File | null>(null);
  const urls = useRef<string[]>([]);

  // Check if running in development mode for simulated capture
  // Next.js inlines NODE_ENV, so this is false in every production build regardless of host or storage flags.
  const isDevMode = process.env.NODE_ENV === "development";

  const reload = useCallback(async () => {
    if (!db || !ownerId) return;
    const rows = await listMedia(db, ownerId, { draftId });
    urls.current.forEach((u) => URL.revokeObjectURL(u));
    urls.current = rows.map((m) => URL.createObjectURL(m.blob));
    setPhotos(rows.map((m, i) => ({ id: m.id, url: urls.current[i] as string, name: m.fileName, size: m.size })));
    set({ mediaLocalIds: rows.map((m) => m.id), simulatedEvidence: rows.some((m) => m.fileName.startsWith("SIMULATED_DEMO_")) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [db, ownerId, draftId]);

  useEffect(() => {
    void reload();
    return () => urls.current.forEach((u) => URL.revokeObjectURL(u));
  }, [reload]);

  const onFiles = async (files: FileList | File[] | null) => {
    if (!files || !db || !ownerId || !orgId) return;
    setError(null);
    setBusy(true);
    try {
      const arr = Array.from(files);
      if (arr.length > 0) setLatestFile(arr[0] ?? null);
      for (const file of arr) {
        if (photos.length >= MAX_PHOTOS) throw new Error(`At most ${MAX_PHOTOS} photos can be attached.`);
        const prepared = await prepareImage(file);
        await addMedia(db, { ownerId, orgId }, draftId, prepared.blob, prepared.fileName);
      }
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "The photo could not be saved.");
    } finally {
      setBusy(false);
    }
  };

  const simulatePhotoCapture = async () => {
    try {
      const simulatedFile = await createSimulatedIncidentPhoto(payload.reportType, payload.location);
      await onFiles([simulatedFile]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Simulated capture failed.");
    }
  };

  return (
    <div className="stack" style={{ gap: "1rem" }}>
      {/* Evidence Banner */}
      <div
        style={{
          background: "#f0f9ff",
          border: "1px solid #bae6fd",
          borderRadius: "10px",
          padding: "0.75rem 1rem",
          display: "flex",
          alignItems: "center",
          gap: "0.6rem",
          fontSize: "0.82rem",
          color: "#0369a1",
        }}
      >
        <span style={{ fontSize: "1.2rem" }}>📸</span>
        <span>
          <strong>Photo evidence is recommended</strong>, but not mandatory. In low-signal or emergency situations, you can save and queue a text report immediately without photos.
        </span>
      </div>

      {/* Capture Actions */}
      <div className="row" style={{ flexWrap: "wrap", gap: "0.6rem" }}>
        <label className="btn large primary" style={{ cursor: "pointer", display: "inline-flex", alignItems: "center", gap: "0.4rem" }}>
          📷 Take Live Photo
          <input
            type="file"
            accept="image/*"
            capture="environment"
            className="sr-only"
            onChange={(e) => {
              void onFiles(e.target.files);
              e.target.value = "";
            }}
            disabled={!ready || busy}
          />
        </label>

        <label className="btn large" style={{ cursor: "pointer", display: "inline-flex", alignItems: "center", gap: "0.4rem" }}>
          🖼️ Choose from Gallery
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            multiple
            className="sr-only"
            onChange={(e) => {
              void onFiles(e.target.files);
              e.target.value = "";
            }}
            disabled={!ready || busy}
          />
        </label>

        {isDevMode && (
          <Button
            size="large"
            variant="default"
            onClick={() => void simulatePhotoCapture()}
            disabled={!ready || busy || photos.length >= MAX_PHOTOS}
            title="Development-only test tool with visible watermarking"
            style={{ border: "1px dashed #cbd5e1" }}
          >
            🧪 Test Camera (Dev Mode)
          </Button>
        )}
      </div>

      {busy ? <p role="status" className="muted">Saving photo securely on device storage…</p> : null}
      {error ? <p className="error" role="alert">{error}</p> : null}

      {/* Photo Gallery Grid */}
      {photos.length ? (
        <ul className="grid cols-3" style={{ listStyle: "none", padding: 0, margin: 0, gap: "0.75rem" }}>
          {photos.map((p) => (
            <li key={p.id} className="card" style={{ padding: "0.5rem", borderRadius: "10px", overflow: "hidden" }}>
              {/* eslint-disable-next-line @next/next/no-img-element -- local blob preview */}
              <img src={p.url} alt={`Attached photo ${p.name}`} style={{ width: "100%", height: "130px", objectFit: "cover", borderRadius: 6 }} />
              <div className="row small" style={{ marginTop: "0.4rem" }}>
                <span>{(p.size / 1024).toFixed(0)} KB</span>
                <Button
                  size="small"
                  className="right"
                  onClick={async () => {
                    if (db && ownerId) {
                      await removeMedia(db, ownerId, p.id);
                      await reload();
                    }
                  }}
                >
                  Remove
                </Button>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted small">No photos attached yet ({photos.length} of {MAX_PHOTOS} max). A photo is optional; an urgent text-only report can be sent without one.</p>
      )}

      <PhotoHazardPreview
        photoFile={latestFile}
        onSelectSample={(sampleFile) => void onFiles([sampleFile])}
        onVerification={(v) => {
          if (v.hazard_detected && v.hazard_class === "LANDSLIDE") {
            set({ reportType: "LANDSLIDE", severity: v.is_roadway_blocked ? "CRITICAL" : "HIGH" });
          }
        }}
      />

      {/* Field Description */}
      <Field label="Describe what you see on the ground" htmlFor="ev-desc" hint="Provide physical context, width of damage, mud depth, or obstacles. (Min 3 chars)">
        <textarea
          id="ev-desc"
          value={payload.description}
          onChange={(e) => set({ description: e.target.value })}
          maxLength={2000}
          rows={3}
          placeholder="e.g. Mudslide debris covers ~20 meters of carriageway. Boulders actively rolling from eastern slope. Traffic halted both sides."
        />
      </Field>
    </div>
  );
}

function PassabilityStep({
  payload,
  set,
}: {
  payload: ReportPayload;
  set: (p: Partial<ReportPayload>) => void;
}) {
  const currentSeverity = payload.severity;
  const currentLane = payload.laneStatus;
  const currentClasses = payload.passableClasses ?? [];
  const isLifeSafety = Boolean(payload.lifeSafetyRisk);

  const toggleClass = (c: PassableVehicleClass) => {
    let next: PassableVehicleClass[];
    if (c === "NONE") {
      next = currentClasses.includes("NONE") ? [] : ["NONE"];
    } else {
      next = currentClasses.filter((x) => x !== "NONE");
      if (next.includes(c)) {
        next = next.filter((x) => x !== c);
      } else {
        next.push(c);
      }
    }
    set({ passableClasses: next });
  };

  return (
    <div className="stack" style={{ gap: "1.4rem" }}>
      {/* 1. SEVERITY LEVEL */}
      <fieldset style={{ border: "none", padding: 0, margin: 0 }}>
        <legend style={{ fontWeight: 800, fontSize: "0.95rem", color: "#0f172a", marginBottom: "0.5rem" }}>
          1. How severe is the disruption?
        </legend>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "0.6rem" }}>
          {REPORT_SEVERITIES.map((s) => {
            const conf = SEVERITY_CONFIG[s];
            const isSelected = currentSeverity === s;
            return (
              <label
                key={s}
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: "0.6rem",
                  padding: "0.85rem 1rem",
                  borderRadius: "12px",
                  background: isSelected ? conf.bg : "#ffffff",
                  border: isSelected ? `2px solid ${conf.color}` : "1.5px solid #e2e8f0",
                  cursor: "pointer",
                  boxShadow: isSelected ? "0 4px 12px rgba(0,0,0,0.06)" : "none",
                  transition: "all 0.15s ease",
                }}
              >
                <input
                  type="radio"
                  name="sev"
                  value={s}
                  checked={isSelected}
                  onChange={() => set({ severity: s })}
                  style={{ marginTop: "0.2rem" }}
                />
                <div>
                  <div style={{ fontWeight: 800, fontSize: "0.9rem", color: conf.color, display: "flex", alignItems: "center", gap: "0.35rem" }}>
                    <span>{conf.icon}</span> {conf.label}
                  </div>
                  <div style={{ fontSize: "0.74rem", color: "#475569", marginTop: "0.2rem", lineHeight: 1.3 }}>
                    {conf.hint}
                  </div>
                </div>
              </label>
            );
          })}
        </div>
      </fieldset>

      {/* 2. LANE PASSABILITY STATUS */}
      <fieldset style={{ border: "none", padding: 0, margin: 0 }}>
        <legend style={{ fontWeight: 800, fontSize: "0.95rem", color: "#0f172a", marginBottom: "0.5rem" }}>
          2. Highway Lane Passability Status
        </legend>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "0.6rem" }}>
          {(Object.keys(LANE_STATUS_CONFIG) as LaneStatus[]).map((ls) => {
            const conf = LANE_STATUS_CONFIG[ls];
            const isSelected = currentLane === ls;
            return (
              <label
                key={ls}
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: "0.6rem",
                  padding: "0.8rem 1rem",
                  borderRadius: "12px",
                  background: isSelected ? "#eff6ff" : "#ffffff",
                  border: isSelected ? "2px solid #0284c7" : "1.5px solid #e2e8f0",
                  cursor: "pointer",
                  boxShadow: isSelected ? "0 4px 12px rgba(2, 132, 199, 0.1)" : "none",
                  transition: "all 0.15s ease",
                }}
              >
                <input
                  type="radio"
                  name="lane_status"
                  value={ls}
                  checked={isSelected}
                  onChange={() => set({ laneStatus: ls })}
                  style={{ marginTop: "0.2rem" }}
                />
                <div>
                  <div style={{ fontWeight: 800, fontSize: "0.88rem", color: isSelected ? "#0369a1" : "#0f172a", display: "flex", alignItems: "center", gap: "0.35rem" }}>
                    <span>{conf.icon}</span> {conf.label}
                  </div>
                  <div style={{ fontSize: "0.74rem", color: "#64748b", marginTop: "0.2rem", lineHeight: 1.3 }}>
                    {conf.hint}
                  </div>
                </div>
              </label>
            );
          })}
        </div>
      </fieldset>

      {/* 3. PERMITTED VEHICLE CLASSES */}
      <div>
        <div style={{ fontWeight: 800, fontSize: "0.95rem", color: "#0f172a", marginBottom: "0.35rem" }}>
          3. Which vehicles can safely pass right now?
        </div>
        <p className="small muted" style={{ margin: "0 0 0.5rem" }}>
          Select all vehicle categories that can navigate past the hazard:
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "0.5rem" }}>
          {VEHICLE_CLASS_OPTIONS.map((opt) => {
            const isChecked = currentClasses.includes(opt.id);
            return (
              <label
                key={opt.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.5rem",
                  padding: "0.65rem 0.85rem",
                  borderRadius: "9px",
                  background: isChecked ? "#f0fdf4" : "#ffffff",
                  border: isChecked ? "1.5px solid #16a34a" : "1px solid #cbd5e1",
                  cursor: "pointer",
                  fontSize: "0.82rem",
                  fontWeight: 600,
                  color: isChecked ? "#15803d" : "#334155",
                }}
              >
                <input
                  type="checkbox"
                  checked={isChecked}
                  onChange={() => toggleClass(opt.id)}
                />
                <span>{opt.icon}</span>
                <span>{opt.label}</span>
              </label>
            );
          })}
        </div>
      </div>

      {/* 4. LIFE SAFETY RISK TOGGLE */}
      <div
        style={{
          background: isLifeSafety ? "#fef2f2" : "#f8fafc",
          border: isLifeSafety ? "2px solid #ef4444" : "1.5px solid #e2e8f0",
          borderRadius: "12px",
          padding: "0.9rem 1.1rem",
          transition: "all 0.15s ease",
        }}
      >
        <label style={{ display: "flex", alignItems: "flex-start", gap: "0.75rem", cursor: "pointer" }}>
          <input
            type="checkbox"
            checked={isLifeSafety}
            onChange={(e) => set({ lifeSafetyRisk: e.target.checked })}
            style={{ marginTop: "0.3rem", width: "18px", height: "18px" }}
          />
          <div>
            <div style={{ fontWeight: 800, fontSize: "0.95rem", color: isLifeSafety ? "#b91c1c" : "#0f172a", display: "flex", alignItems: "center", gap: "0.4rem" }}>
              <span>🚨</span> URGENT LIFE-SAFETY RISK / CASUALTY ALERT
            </div>
            <div style={{ fontSize: "0.78rem", color: isLifeSafety ? "#991b1b" : "#64748b", marginTop: "0.25rem" }}>
              Check this if people are trapped, injured, or need rescue. The flag is saved with the report and shown to reviewers. This app does not dispatch help: call the control room or emergency services directly.
            </div>
          </div>
        </label>
      </div>
    </div>
  );
}

export function ReportWizard() {
  const params = useSearchParams();
  const router = useRouter();
  const me = usePrincipal();
  const announce = useAnnounce();
  const { db, ownerId, orgId, ready, error: dbError, syncNow, refresh } = useOffline();

  const draftParam = params.get("draft");
  const typeParam = params.get("type"); // Read ?type= query param from home shortcut chips

  const [draftId, setDraftId] = useState<string | null>(draftParam);
  const [payload, setPayload] = useState<ReportPayload | null>(null);
  const [step, setStep] = useState(0);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [queued, setQueued] = useState<"queued" | null>(null);
  const [problems, setProblems] = useState<string[]>([]);
  const [queuing, setQueuing] = useState(false);
  const dirty = useRef(false);
  const initialised = useRef(false);

  // Quick chips for description notes
  const QUICK_NOTES = [
    "Debris mud depth > 1 foot",
    "Boulders actively rolling down mountain",
    "Single-lane alternating traffic only",
    "Commercial freight trucks stranded",
    "Culvert structurally undermined",
    "Power lines downed across highway",
  ];

  // Create or load the draft.
  useEffect(() => {
    if (!db || !ownerId || !orgId || initialised.current) return;
    initialised.current = true;

    void (async () => {
      if (draftParam) {
        const found = await getDraft(db, ownerId, draftParam);
        if (found) {
          setDraftId(draftParam);
          setPayload(found.payload);
          setStep(Math.min(found.draft.step, STEPS.length - 1));
          return;
        }
      }

      // Initialize a new draft
      const id = await newDraft(db, { ownerId, orgId });
      setDraftId(id);
      const initial = emptyPayload(new Date());

      // If ?type= was specified in URL, pre-select that hazard type!
      if (typeParam && (REPORT_TYPES as readonly string[]).includes(typeParam)) {
        initial.reportType = typeParam as ReportType;
      }

      setPayload(initial);
      router.replace(`/field/report/new?draft=${id}`);
    })().catch((e: unknown) => setSaveError(e instanceof Error ? e.message : "Could not open local storage"));
  }, [db, ownerId, orgId, draftParam, typeParam, router]);

  const update = useCallback((patch: Partial<ReportPayload>) => {
    dirty.current = true;
    setPayload((p) => (p ? { ...p, ...patch } : p));
  }, []);

  // Autosave to IndexedDB
  useEffect(() => {
    if (!db || !ownerId || !orgId || !draftId || !payload || !dirty.current) return;
    const t = setTimeout(() => {
      saveDraft(db, { ownerId, orgId }, draftId, payload, step)
        .then(() => {
          dirty.current = false;
          setSavedAt(new Date());
          setSaveError(null);
        })
        .catch((e: unknown) =>
          setSaveError(e instanceof StorageFullError ? e.message : e instanceof Error ? e.message : "Could not save on device")
        );
    }, 400);
    return () => clearTimeout(t);
  }, [db, ownerId, orgId, draftId, payload, step]);

  const goto = (n: number) => {
    dirty.current = true;
    setStep(n);
  };

  const setObservedOffset = (minutesAgo: number) => {
    const d = new Date(Date.now() - minutesAgo * 60_000);
    update({ observedAt: d.toISOString() });
  };

  const appendNote = (note: string) => {
    if (!payload) return;
    const current = payload.description.trim();
    const updated = current ? `${current}. ${note}` : note;
    update({ description: updated });
  };

  if (dbError) {
    return (
      <Banner tone="danger" title="This device cannot store reports offline">
        <p className="small">{dbError}</p>
      </Banner>
    );
  }

  if (!ready || !payload || !draftId) return <p role="status" className="muted">Opening your report draft…</p>;

  if (queued) {
    return (
      <Card title="Saved in Device Outbox">
        <div className="stack" style={{ gap: "1rem" }}>
          <Banner tone="ok" title="Saved on device — queued for synchronization">
            <p className="small">
              Your field observation is safely stored in local IndexedDB. It counts as officially submitted once central handshake succeeds. Background sync will transmit automatically as soon as network signal is detected.
            </p>
          </Banner>
          <div className="row" style={{ flexWrap: "wrap", gap: "0.6rem" }}>
            <Link className="btn primary" href="/field/queue">See send queue</Link>
            <Link className="btn" href="/field/report/new" onClick={() => window.location.assign("/field/report/new")}>Report another incident</Link>
            <Link className="btn" href="/field">Back to Operations Home</Link>
          </div>
        </div>
      </Card>
    );
  }

  const finish = async () => {
    const found = validatePayload(payload);
    setProblems(found);
    if (found.length) return;
    setQueuing(true);
    try {
      await saveDraft(db as NonNullable<typeof db>, { ownerId: ownerId as string, orgId: orgId as string }, draftId, payload, step);
      await queueDraft(db as NonNullable<typeof db>, ownerId as string, draftId);
      setQueued("queued");
      announce("Saved in device outbox. Queued for transmission.");
      void requestBackgroundSync();
      await refresh();
      void syncNow();
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Could not queue the report");
    } finally {
      setQueuing(false);
    }
  };

  const snappedReview = payload.location ? snapToCorridor(payload.location.latitude, payload.location.longitude) : null;

  return (
    <div className="stack" style={{ gap: "1.2rem" }}>
      {/* Progress Stepper */}
      <ol className="step-list" aria-label="Progress">
        {STEPS.map((s, i) => (
          <li key={s} aria-current={i === step ? "step" : undefined}>
            {i + 1}. {s}
          </li>
        ))}
      </ol>

      {/* Storage and Identity Indicator */}
      <p className="small muted" role="status" style={{ margin: 0 }}>
        {saveError ? (
          <span className="error">{saveError}</span>
        ) : savedAt ? (
          `Autosaved in device storage at ${formatDateTime(savedAt)}`
        ) : (
          "Draft initialised on device"
        )}{" "}
        · Reporter: <strong>{me.display_name}</strong> (NH-27 / NH-6 Lifeline Patrol)
      </p>

      <Card title={STEPS[step] ?? ""}>
        {/* ── STEP 1: WHAT HAPPENED? ── */}
        {step === 0 && (
          <div className="stack" style={{ gap: "1.5rem" }}>
            <VoiceReportSection
              location={payload.location}
              onSuccess={(reportId) => {
                announce("Voice report created and submitted!");
                router.push(`/field/reports/${reportId}`);
              }}
            />
            <fieldset style={{ border: "none", padding: 0, margin: 0 }}>
              <legend style={{ fontWeight: 700, fontSize: "0.85rem", color: "#64748b", marginBottom: "0.75rem", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                Or select incident category manually
              </legend>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
                  gap: "0.75rem",
                }}
              >
                {REPORT_TYPES.map((t) => {
                  const conf = TYPE_CONFIG[t];
                  const isSelected = payload.reportType === t;
                  return (
                    <label
                      key={t}
                      style={{
                        display: "flex",
                        alignItems: "flex-start",
                        gap: "0.75rem",
                        padding: "1rem 1.15rem",
                        borderRadius: "14px",
                        background: isSelected ? "#f0f9ff" : "#ffffff",
                        border: isSelected ? "2.5px solid #0284c7" : "1.5px solid #e2e8f0",
                        cursor: "pointer",
                        boxShadow: isSelected ? "0 4px 15px rgba(2, 132, 199, 0.15)" : "0 2px 6px rgba(0,0,0,0.03)",
                        transition: "all 0.15s ease",
                      }}
                    >
                      <input
                        type="radio"
                        name="rtype"
                        value={t}
                        checked={isSelected}
                        onChange={() => update({ reportType: t })}
                        style={{ marginTop: "0.25rem" }}
                      />
                      <div style={{ flex: 1 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <div style={{ fontWeight: 800, fontSize: "1rem", color: isSelected ? "#0369a1" : "#0f172a", display: "flex", alignItems: "center", gap: "0.4rem" }}>
                            <span style={{ fontSize: "1.3rem" }}>{conf.icon}</span>
                            <span>{conf.label}</span>
                          </div>
                          <span
                            style={{
                              fontSize: "0.65rem",
                              fontWeight: 700,
                              padding: "0.15rem 0.45rem",
                              borderRadius: "6px",
                              background: isSelected ? "#e0f2fe" : "#f1f5f9",
                              color: isSelected ? "#0284c7" : "#64748b",
                            }}
                          >
                            {conf.badge}
                          </span>
                        </div>
                        <div style={{ fontSize: "0.76rem", color: "#64748b", marginTop: "0.3rem", lineHeight: 1.35 }}>
                          {conf.hint}
                        </div>
                      </div>
                    </label>
                  );
                })}
              </div>
            </fieldset>
          </div>
        )}

        {/* ── STEP 2: WHERE IS IT? ── */}
        {step === 1 && <LocationStep payload={payload} set={update} draftId={draftId} />}

        {/* ── STEP 3: EVIDENCE & PHOTOS ── */}
        {step === 2 && <EvidenceStep payload={payload} set={update} draftId={draftId} />}

        {/* ── STEP 4: PASSABILITY & SEVERITY ── */}
        {step === 3 && <PassabilityStep payload={payload} set={update} />}

        {/* ── STEP 5: REVIEW, OBSERVED TIME & SUBMIT ── */}
        {step === 4 && (
          <div className="stack" style={{ gap: "1.2rem" }}>
            {/* Observed Time Presets */}
            <div style={{ background: "#f8fafc", padding: "0.9rem 1.1rem", borderRadius: "12px", border: "1px solid #e2e8f0" }}>
              <div style={{ fontWeight: 800, fontSize: "0.9rem", color: "#0f172a", marginBottom: "0.3rem" }}>
                ⏱️ When did you observe this hazard?
              </div>
              <p className="small muted" style={{ margin: "0 0 0.6rem" }}>
                Select an approximate offset if you just gained connectivity after driving out of a shadow zone:
              </p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "0.45rem", marginBottom: "0.75rem" }}>
                <button
                  type="button"
                  onClick={() => setObservedOffset(0)}
                  style={{ background: "#ffffff", border: "1px solid #cbd5e1", borderRadius: "8px", padding: "0.4rem 0.75rem", fontSize: "0.78rem", fontWeight: 700, cursor: "pointer" }}
                >
                  ⚡ Just now (Live)
                </button>
                <button
                  type="button"
                  onClick={() => setObservedOffset(15)}
                  style={{ background: "#ffffff", border: "1px solid #cbd5e1", borderRadius: "8px", padding: "0.4rem 0.75rem", fontSize: "0.78rem", fontWeight: 600, cursor: "pointer" }}
                >
                  15 min ago
                </button>
                <button
                  type="button"
                  onClick={() => setObservedOffset(30)}
                  style={{ background: "#ffffff", border: "1px solid #cbd5e1", borderRadius: "8px", padding: "0.4rem 0.75rem", fontSize: "0.78rem", fontWeight: 600, cursor: "pointer" }}
                >
                  30 min ago
                </button>
                <button
                  type="button"
                  onClick={() => setObservedOffset(60)}
                  style={{ background: "#ffffff", border: "1px solid #cbd5e1", borderRadius: "8px", padding: "0.4rem 0.75rem", fontSize: "0.78rem", fontWeight: 600, cursor: "pointer" }}
                >
                  1 hour ago
                </button>
              </div>

              <Field label="Exact Observed Timestamp" htmlFor="obs-at" hint="Server records observation time and transmission time separately">
                <input
                  id="obs-at"
                  type="datetime-local"
                  value={toLocalInput(payload.observedAt)}
                  onChange={(e) => e.target.value && update({ observedAt: new Date(e.target.value).toISOString() })}
                />
              </Field>
            </div>

            {/* Quick Description Addons */}
            <div>
              <div style={{ fontWeight: 800, fontSize: "0.88rem", color: "#0f172a", marginBottom: "0.35rem" }}>
                Tap to append common ground notes:
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem" }}>
                {QUICK_NOTES.map((qn) => (
                  <button
                    key={qn}
                    type="button"
                    onClick={() => appendNote(qn)}
                    style={{
                      background: "#f1f5f9",
                      border: "1px solid #cbd5e1",
                      borderRadius: "6px",
                      padding: "0.35rem 0.65rem",
                      fontSize: "0.74rem",
                      fontWeight: 600,
                      color: "#334155",
                      cursor: "pointer",
                    }}
                  >
                    + {qn}
                  </button>
                ))}
              </div>
            </div>

            {/* Review Dossier Summary */}
            <div
              style={{
                background: "#ffffff",
                border: "1.5px solid #cbd5e1",
                borderRadius: "14px",
                padding: "1rem 1.25rem",
                boxShadow: "0 2px 8px rgba(15, 23, 42, 0.04)",
              }}
            >
              <div style={{ fontWeight: 800, fontSize: "0.95rem", color: "#0f172a", marginBottom: "0.75rem", borderBottom: "1px solid #e2e8f0", paddingBottom: "0.45rem" }}>
                📋 Observation Dossier Summary
              </div>
              <dl className="kv" style={{ margin: 0 }}>
                <dt>Incident Type</dt>
                <dd>
                  <strong>{payload.reportType ? humanize(payload.reportType) : "—"}</strong>
                </dd>

                <dt>Ground Severity</dt>
                <dd>{payload.severity ? <StatusBadge kind="severity" value={payload.severity} /> : "—"}</dd>

                <dt>Lane Status</dt>
                <dd>
                  {payload.laneStatus ? (
                    <span style={{ fontWeight: 700, color: payload.laneStatus === "BOTH_BLOCKED" ? "#b91c1c" : "#0f172a" }}>
                      {LANE_STATUS_CONFIG[payload.laneStatus]?.icon} {LANE_STATUS_CONFIG[payload.laneStatus]?.label}
                    </span>
                  ) : (
                    "—"
                  )}
                </dd>

                <dt>Passable For</dt>
                <dd>
                  {payload.passableClasses && payload.passableClasses.length > 0
                    ? payload.passableClasses.map((c) => humanize(c)).join(", ")
                    : "No vehicle classes specified"}
                </dd>

                <dt>Life-Safety Risk</dt>
                <dd>
                  {payload.lifeSafetyRisk ? (
                    <span style={{ background: "#fee2e2", color: "#b91c1c", padding: "0.2rem 0.55rem", borderRadius: "6px", fontWeight: 800, fontSize: "0.78rem" }}>
                      🚨 ACTIVE CASUALTY / RESCUE ALERT
                    </span>
                  ) : (
                    <span style={{ color: "#16a34a", fontWeight: 600 }}>Normal Ground Report</span>
                  )}
                </dd>

                <dt>Highway Chainage</dt>
                <dd>
                  {snappedReview ? (
                    <span>
                      <strong>{snappedReview.formattedChainage}</strong> (Near {snappedReview.nearestMilestone})
                    </span>
                  ) : payload.location ? (
                    formatCoords(payload.location.latitude, payload.location.longitude)
                  ) : (
                    "—"
                  )}
                </dd>

                <dt>Field Notes</dt>
                <dd style={{ fontStyle: payload.description ? "normal" : "italic", color: payload.description ? "#0f172a" : "#94a3b8" }}>
                  {payload.description || "No additional text provided"}
                </dd>

                <dt>Evidence Photos</dt>
                <dd>
                  {payload.mediaLocalIds.length} attached photo(s)
                </dd>
              </dl>
            </div>

            {problems.length ? (
              <Banner tone="warn" title="Fix these items before queueing">
                <ul>
                  {problems.map((p) => (
                    <li key={p}>{p}</li>
                  ))}
                </ul>
              </Banner>
            ) : null}

            <p className="small muted">
              Field observations count as unverified reports upon ingestion. Government and regional dispatchers will verify before route status is formally modified.
            </p>

            <Button
              size="large"
              variant="primary"
              busy={queuing}
              onClick={() => void finish()}
              style={{ padding: "0.95rem 1.5rem", fontSize: "1rem", fontWeight: 800, background: "linear-gradient(135deg, #0284c7 0%, #0369a1 100%)" }}
            >
              💾 Save on Device &amp; Queue for Transmission
            </Button>

            <StorageStatusPanel />
          </div>
        )}
      </Card>

      {/* Navigation Buttons */}
      <div className="row" style={{ justifyContent: "space-between", alignItems: "center", marginTop: "0.5rem" }}>
        <Button onClick={() => goto(Math.max(0, step - 1))} disabled={step === 0}>
          ← Back
        </Button>
        <div style={{ display: "flex", gap: "0.6rem" }}>
          <Link className="btn" href="/field/queue">
            Save draft and exit
          </Link>
          {step < STEPS.length - 1 && (
            <Button variant="primary" onClick={() => goto(step + 1)}>
              Next Step →
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

function toLocalInput(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
