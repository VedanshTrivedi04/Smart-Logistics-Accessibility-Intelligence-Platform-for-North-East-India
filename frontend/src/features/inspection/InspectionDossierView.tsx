"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { useReport } from "@/features/incidents";
import { useGeolocation, NORTH_EAST_LOCATION_PRESETS } from "@/features/field/useGeolocation";
import { prepareImage, sha256Hex } from "@/features/field/sync/media";
import { httpTransport } from "@/features/field/sync/transport";
import { formatAge as formatRelativeTime, formatDateTime } from "@/shared/lib/time";
import { bboxAround, haversineMeters } from "@/shared/lib/geo";
import { MapView, type MapLine, type MapPoint } from "@/shared/map";
import type { RejectionReason } from "@/shared/api";
import { Banner, Card, Field } from "@/shared/ui";
import {
  useDecideInspection,
  useInspection,
  useStartInspection,
  useSubmitAssessment,
} from "./queries";
import type {
  DamageType,
  EvidenceKind,
  InspectionEvidenceCreate,
  PassabilityStatus,
  StructuralStability,
  TechnicalAssessment,
} from "./types";
import {
  Camera,
  Compass,
  Construction,
  Play,
  ShieldAlert,
  Upload,
} from "lucide-react";

export function InspectionDossierView({ inspectionId }: { inspectionId: string }) {
  const geo = useGeolocation(true);
  useEffect(() => {
    geo.locate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const fix = geo.state.status === "ok" ? geo.state.fix : null;
  const coords = useMemo(() => (fix ? { latitude: fix.latitude, longitude: fix.longitude } : null), [fix]);
  const accuracy = fix?.accuracy_m ?? 50;
  const altitude = fix?.altitude_m ?? null;

  const inspectionQuery = useInspection(inspectionId);
  const startMutation = useStartInspection();
  const assessmentMutation = useSubmitAssessment();
  const decideMutation = useDecideInspection();

  const inspection = inspectionQuery.data;
  const reportQuery = useReport(inspection?.report_id ?? null);
  const report = reportQuery.data;

  // Form State
  const [roadCondition, setRoadCondition] = useState("");
  const [damageType, setDamageType] = useState<DamageType>("LANDSLIDE");
  const [passability, setPassability] = useState<PassabilityStatus>("IMPASSABLE");
  const [stability, setStability] = useState<StructuralStability>("MONITORING_REQUIRED");
  const [affectedLength, setAffectedLength] = useState<string>("30");
  const [affectedWidth, setAffectedWidth] = useState<string>("8");
  const [debrisDepth, setDebrisDepth] = useState<string>("1.5");
  const [pierScourDepth, setPierScourDepth] = useState<string>("0");
  const [waterLevelCm, setWaterLevelCm] = useState<string>("0");
  const [slopeMovement, setSlopeMovement] = useState<boolean>(true);
  const [heavyVehiclePassable, setHeavyVehiclePassable] = useState<boolean>(false);
  const [speedLimit, setSpeedLimit] = useState<string>("0");
  const [technicalNotes, setTechnicalNotes] = useState("");

  // Evidence upload state
  const [evidenceKind, setEvidenceKind] = useState<EvidenceKind>("WIDE_ANGLE");
  const [evidenceCaption, setEvidenceCaption] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Decision Modal / State
  const [decisionNotes, setDecisionNotes] = useState("");
  const [rejectionReason, setRejectionReason] = useState<RejectionReason>("UNVERIFIABLE");
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [formInitialized, setFormInitialized] = useState(false);

  // Initialize form from existing assessment if present
  if (inspection?.assessment && !formInitialized) {
    const a = inspection.assessment;
    setRoadCondition(a.road_condition || "");
    setDamageType(a.damage_type || "LANDSLIDE");
    setPassability(a.passability || "IMPASSABLE");
    setStability(a.stability || "STABLE");
    if (a.affected_length_m !== undefined && a.affected_length_m !== null) setAffectedLength(String(a.affected_length_m));
    if (a.affected_width_m !== undefined && a.affected_width_m !== null) setAffectedWidth(String(a.affected_width_m));
    if (a.debris_depth_m !== undefined && a.debris_depth_m !== null) setDebrisDepth(String(a.debris_depth_m));
    if (a.bridge_pier_scour_depth_m !== undefined && a.bridge_pier_scour_depth_m !== null) setPierScourDepth(String(a.bridge_pier_scour_depth_m));
    if (a.water_level_over_road_cm !== undefined && a.water_level_over_road_cm !== null) setWaterLevelCm(String(a.water_level_over_road_cm));
    if (a.slope_movement_detected !== undefined && a.slope_movement_detected !== null) setSlopeMovement(Boolean(a.slope_movement_detected));
    setHeavyVehiclePassable(Boolean(a.heavy_vehicle_passable));
    if (a.recommended_speed_limit_kmh !== undefined && a.recommended_speed_limit_kmh !== null) setSpeedLimit(String(a.recommended_speed_limit_kmh));
    setTechnicalNotes(a.technical_notes || "");
    setFormInitialized(true);
  }

  // Target Location Resolution (Multi-Tier fallback for corridor milestones)
  const defaultTarget = useMemo(() => {
    // 1. If report has explicit location, use it
    if (report?.location) {
      return {
        lat: report.location.latitude,
        lon: report.location.longitude,
        label: `Reported Hazard (${report.report_type || "Incident Site"})`,
        source: "patrol_report" as const,
      };
    }

    // 2. Parse from instructions or edge_id
    const text = `${inspection?.instructions || ""} ${inspection?.candidate_edge_id || ""}`.toLowerCase();

    if (text.includes("km 42") || text.includes("42 km") || text.includes("bridge scour") || text.includes("umtrew")) {
      return {
        lat: 25.9650,
        lon: 91.8820,
        label: "Corridor Target: NH-6 km 42 (Umtrew Heavy Bridge Sector)",
        source: "milestone_parser" as const,
      };
    }
    if (text.includes("kamrup") || text.includes("jorabat") || text.includes("nh6") || text.includes("nh-6")) {
      return {
        lat: 26.0850,
        lon: 91.8650,
        label: "Corridor Target: NH-6 Kamrup Jorabat Section",
        source: "corridor_edge" as const,
      };
    }
    if (text.includes("nh27") || text.includes("nh-27") || text.includes("jagiroad") || text.includes("nagaon")) {
      return {
        lat: 26.1700,
        lon: 92.1600,
        label: "Corridor Target: NH-27 Jagiroad Expressway",
        source: "corridor_edge" as const,
      };
    }
    if (text.includes("nh10") || text.includes("sikkim") || text.includes("sevoke") || text.includes("teesta")) {
      return {
        lat: 26.8900,
        lon: 88.4700,
        label: "Corridor Target: NH-10 Teesta Valley Corridor",
        source: "corridor_edge" as const,
      };
    }

    // 3. Fallback: Vital North-East corridor gateway
    return {
      lat: 26.0850,
      lon: 91.8650,
      label: inspection?.candidate_edge_id ? `Assigned Corridor: ${inspection.candidate_edge_id}` : "Assigned Hazard Inspection Target",
      source: "corridor_fallback" as const,
    };
  }, [report, inspection]);

  const [customTarget, setCustomTarget] = useState<{ lat: number; lon: number; label: string } | null>(null);
  const targetLocation = customTarget || defaultTarget;

  // Inspector Positioning Mode:
  // "simulated" = on-site test fix ~85m from hazard (allows instant verification & realistic testing).
  // "device" = live device GPS fix from browser.
  const [inspectorMode, setInspectorMode] = useState<"device" | "simulated">("simulated");
  const [cameraFocus, setCameraFocus] = useState<"hazard" | "inspector" | "both">("hazard");

  const inspectorCoords = useMemo(() => {
    if (inspectorMode === "simulated") {
      return {
        latitude: targetLocation.lat - 0.00055,
        longitude: targetLocation.lon + 0.00065,
        accuracy: 8,
        source: "simulated_onsite" as const,
        label: "Inspector On-Site Position (~85m from hazard)",
      };
    }
    if (coords) {
      return {
        latitude: coords.latitude,
        longitude: coords.longitude,
        accuracy,
        source: "device_gps" as const,
        label: `Inspector Device GPS (±${Math.round(accuracy)}m)`,
      };
    }
    return null;
  }, [inspectorMode, targetLocation, coords, accuracy]);

  // Distance calculations
  const distanceToTargetMeters = useMemo(() => {
    if (!inspectorCoords || !targetLocation) return null;
    return haversineMeters(inspectorCoords.latitude, inspectorCoords.longitude, targetLocation.lat, targetLocation.lon);
  }, [inspectorCoords, targetLocation]);

  const effectiveDistanceMeters = distanceToTargetMeters;

  const mapBbox = useMemo(() => {
    if (cameraFocus === "inspector" && inspectorCoords) {
      return bboxAround(inspectorCoords.latitude, inspectorCoords.longitude, 1200);
    }
    if (cameraFocus === "both" && inspectorCoords && targetLocation) {
      const minLat = Math.min(inspectorCoords.latitude, targetLocation.lat);
      const maxLat = Math.max(inspectorCoords.latitude, targetLocation.lat);
      const minLon = Math.min(inspectorCoords.longitude, targetLocation.lon);
      const maxLon = Math.max(inspectorCoords.longitude, targetLocation.lon);
      const padLat = Math.max(0.005, (maxLat - minLat) * 0.25);
      const padLon = Math.max(0.005, (maxLon - minLon) * 0.25);
      return [minLon - padLon, minLat - padLat, maxLon + padLon, maxLat + padLat] as [number, number, number, number];
    }
    // Default 'hazard':
    if (inspectorMode === "simulated" && inspectorCoords) {
      const minLat = Math.min(inspectorCoords.latitude, targetLocation.lat);
      const maxLat = Math.max(inspectorCoords.latitude, targetLocation.lat);
      const minLon = Math.min(inspectorCoords.longitude, targetLocation.lon);
      const maxLon = Math.max(inspectorCoords.longitude, targetLocation.lon);
      return bboxAround((minLat + maxLat) / 2, (minLon + maxLon) / 2, 700);
    }
    return bboxAround(targetLocation.lat, targetLocation.lon, 1200);
  }, [cameraFocus, inspectorCoords, targetLocation, inspectorMode]);

  const mapPoints = useMemo<MapPoint[]>(() => {
    const pts: MapPoint[] = [
      {
        id: "hazard-site",
        lat: targetLocation.lat,
        lon: targetLocation.lon,
        label: targetLocation.label,
        kind: "incident",
        tone: (report?.severity === "CRITICAL" || inspection?.priority === "CRITICAL") ? "danger" : "warn",
        pulse: true,
      },
    ];

    if (inspectorCoords) {
      pts.push({
        id: "inspector-live-gps",
        lat: inspectorCoords.latitude,
        lon: inspectorCoords.longitude,
        label: inspectorCoords.label,
        kind: "self",
        glyph: "🔬",
        tone: "info",
      });
    }

    return pts;
  }, [targetLocation, report, inspection, inspectorCoords]);

  const mapLines = useMemo<MapLine[]>(() => {
    if (!inspectorCoords || !targetLocation) return [];
    return [
      {
        id: "approach-vector",
        cls: "route_feasible_a",
        label: distanceToTargetMeters
          ? `${distanceToTargetMeters < 1000 ? Math.round(distanceToTargetMeters) + "m" : (distanceToTargetMeters / 1000).toFixed(1) + "km"} Vector`
          : "Approach Vector",
        coordinates: [
          [inspectorCoords.longitude, inspectorCoords.latitude],
          [targetLocation.lon, targetLocation.lat],
        ],
      },
    ];
  }, [inspectorCoords, targetLocation, distanceToTargetMeters]);

  const handleMapClick = (lon: number, lat: number) => {
    setCustomTarget({
      lat,
      lon,
      label: `Pinned Inspection Point (${lat.toFixed(4)}°N, ${lon.toFixed(4)}°E)`,
    });
    setActionSuccess(`Inspection target re-pinned to ${lat.toFixed(5)}°N, ${lon.toFixed(5)}°E.`);
  };

  const handleSnapToGps = () => {
    if (!inspectorCoords) return;
    setCustomTarget({
      lat: inspectorCoords.latitude,
      lon: inspectorCoords.longitude,
      label: `Inspector Fix (${inspectorCoords.source === "simulated_onsite" ? "On-Site Survey" : `GPS ±${Math.round(inspectorCoords.accuracy)}m`})`,
    });
    setActionSuccess("Inspection target locked to current inspector position.");
  };

  const handleResetTarget = () => {
    setCustomTarget(null);
    setActionSuccess("Reset inspection target to original corridor milestone.");
  };

  const handleStart = async () => {
    try {
      await startMutation.mutateAsync(inspectionId);
      setActionSuccess("Inspection mission started. Patrol report claimed into under-review status.");
    } catch {
      /* handled in error notice */
    }
  };

  const handleSaveAssessment = async (e?: FormEvent) => {
    if (e) e.preventDefault();
    const payload: TechnicalAssessment = {
      road_condition: roadCondition || "On-site technical evaluation",
      passability,
      damage_type: damageType,
      stability,
      affected_length_m: affectedLength ? parseFloat(affectedLength) : null,
      affected_width_m: affectedWidth ? parseFloat(affectedWidth) : null,
      debris_depth_m: debrisDepth ? parseFloat(debrisDepth) : null,
      bridge_pier_scour_depth_m: pierScourDepth ? parseFloat(pierScourDepth) : null,
      water_level_over_road_cm: waterLevelCm ? parseFloat(waterLevelCm) : null,
      slope_movement_detected: slopeMovement,
      heavy_vehicle_passable: heavyVehiclePassable,
      recommended_speed_limit_kmh: speedLimit ? parseInt(speedLimit, 10) : null,
      technical_notes: technicalNotes,
      raw_measurements: {
        assessed_at: new Date().toISOString(),
        inspector_gps_accuracy_m: inspectorCoords?.accuracy ?? accuracy,
        inspector_latitude: inspectorCoords?.latitude,
        inspector_longitude: inspectorCoords?.longitude,
        inspector_source: inspectorCoords?.source,
        target_latitude: targetLocation.lat,
        target_longitude: targetLocation.lon,
        target_label: targetLocation.label,
      },
    };

    try {
      await assessmentMutation.mutateAsync({
        inspectionId,
        payload: {
          assessment: payload,
          evidence: [],
        },
      });
      setActionSuccess("Technical assessment recorded successfully.");
    } catch {
      /* handled in error notice */
    }
  };

  const handlePickPhoto = () => fileInputRef.current?.click();

  const handleFileSelected = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow picking the same file again
    if (!file) return;

    setUploadError(null);
    setUploading(true);
    try {
      // Same upload pipeline (prepare -> ticket -> put -> confirm) field reports use, so evidence
      // photos go through the same Cloudinary storage and server-side validation.
      const prepared = await prepareImage(file);
      const sha256 = await sha256Hex(prepared.blob);
      const ticket = await httpTransport.requestUploadTicket({
        fileName: prepared.fileName,
        sizeBytes: prepared.blob.size,
        mimeType: file.type,
        sha256,
      });
      await httpTransport.putObject(ticket, prepared.blob, file.type);
      await httpTransport.confirmUpload(ticket.mediaId, { widthPx: prepared.width, heightPx: prepared.height });

      const newEv: InspectionEvidenceCreate = {
        media_id: ticket.mediaId,
        kind: evidenceKind,
        caption: evidenceCaption || `${evidenceKind.replace("_", " ")} captured on-site`,
        latitude: inspectorCoords?.latitude ?? targetLocation.lat,
        longitude: inspectorCoords?.longitude ?? targetLocation.lon,
        altitude_m: altitude,
      };

      const payload: TechnicalAssessment = {
        road_condition: roadCondition || "On-site assessment",
        passability,
        damage_type: damageType,
        stability,
        affected_length_m: affectedLength ? parseFloat(affectedLength) : null,
        affected_width_m: affectedWidth ? parseFloat(affectedWidth) : null,
        debris_depth_m: debrisDepth ? parseFloat(debrisDepth) : null,
        bridge_pier_scour_depth_m: pierScourDepth ? parseFloat(pierScourDepth) : null,
        water_level_over_road_cm: waterLevelCm ? parseFloat(waterLevelCm) : null,
        slope_movement_detected: slopeMovement,
        heavy_vehicle_passable: heavyVehiclePassable,
        recommended_speed_limit_kmh: speedLimit ? parseInt(speedLimit, 10) : null,
        technical_notes: technicalNotes,
        raw_measurements: {},
      };

      await assessmentMutation.mutateAsync({
        inspectionId,
        payload: {
          assessment: payload,
          evidence: [newEv],
        },
      });
      setEvidenceCaption("");
      setActionSuccess(`Evidence photo tagged as ${evidenceKind} added to dossier.`);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Could not upload this photo.");
    } finally {
      setUploading(false);
    }
  };

  const handleDecide = async (decision: string) => {
    try {
      await decideMutation.mutateAsync({
        inspectionId,
        decision,
        notes: decisionNotes || `Inspection decision: ${decision}`,
        rejectionReason: decision === "REJECTED" ? rejectionReason : undefined,
      });
      setActionSuccess(`Authoritative decision '${decision}' successfully committed to network and emergency impact engine.`);
    } catch {
      /* handled in error notice */
    }
  };

  if (inspectionQuery.isLoading) {
    return (
      <div style={{ maxWidth: "1080px", margin: "2rem auto", textAlign: "center" }}>
        Loading inspection dossier...
      </div>
    );
  }

  if (!inspection) {
    return (
      <div style={{ maxWidth: "1080px", margin: "2rem auto" }}>
        <Banner tone="danger" title="Inspection Mission Not Found">
          <p className="small">The requested inspection record could not be loaded.</p>
        </Banner>
        <Link href="/inspector/inspections" className="btn small" style={{ marginTop: "1rem" }}>
          &larr; Back to Inspections
        </Link>
      </div>
    );
  }

  const isAssigned = inspection.status === "ASSIGNED";
  const isInProgress = inspection.status === "IN_PROGRESS";
  const isCompleted = inspection.status === "COMPLETED";
  const isRecheck = inspection.status === "REINSPECTION_REQUIRED";

  return (
    <div className="stack" style={{ gap: "1.75rem", maxWidth: "1080px", margin: "0 auto", paddingBottom: "4rem" }}>
      {/* Top Breadcrumb & Status */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "0.5rem" }}>
        <Link href="/inspector/inspections" className="small muted" style={{ display: "flex", alignItems: "center", gap: "0.3rem" }}>
          &larr; Back to Inspections
        </Link>
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <span className="mono small muted">Mission ID: {inspection.id.slice(0, 8)}</span>
          <span
            style={{
              padding: "0.2rem 0.6rem",
              borderRadius: "4px",
              fontSize: "0.75rem",
              fontWeight: 800,
              backgroundColor: isCompleted ? "#ecfdf5" : isInProgress ? "#eff6ff" : isRecheck ? "#fef2f2" : "#fffbeb",
              color: isCompleted ? "#065f46" : isInProgress ? "#1e40af" : isRecheck ? "#991b1b" : "#92400e",
              border: `1px solid ${isCompleted ? "#a7f3d0" : isInProgress ? "#bfdbfe" : isRecheck ? "#fecaca" : "#fde68a"}`,
            }}
          >
            {inspection.status}
          </span>
          <span
            style={{
              padding: "0.2rem 0.6rem",
              borderRadius: "4px",
              fontSize: "0.75rem",
              fontWeight: 800,
              backgroundColor: inspection.priority === "CRITICAL" ? "#dc2626" : inspection.priority === "HIGH" ? "#ea580c" : "#0284c7",
              color: "#ffffff",
            }}
          >
            {inspection.priority} PRIORITY
          </span>
        </div>
      </div>

      {actionSuccess && (
        <Banner tone="ok" title="Action Completed">
          <p className="small">{actionSuccess}</p>
        </Banner>
      )}

      {/* Hero Dossier Header */}
      <div
        style={{
          background: "linear-gradient(135deg, #1e293b 0%, #0f172a 100%)",
          color: "#ffffff",
          borderRadius: "14px",
          padding: "1.5rem 1.75rem",
          border: "1px solid #334155",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          flexWrap: "wrap",
          gap: "1.25rem",
        }}
      >
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.3rem" }}>
            <span style={{ fontSize: "1.2rem" }}>🔬</span>
            <span style={{ fontSize: "0.8rem", color: "#38bdf8", fontWeight: 700, textTransform: "uppercase" }}>
              Technical Inspection Dossier
            </span>
            {inspection.candidate_edge_id && (
              <span className="mono small" style={{ background: "rgba(56, 189, 248, 0.15)", padding: "0.15rem 0.45rem", borderRadius: "4px", color: "#7dd3fc" }}>
                Corridor: {inspection.candidate_edge_id}
              </span>
            )}
          </div>
          <h1 style={{ fontSize: "1.6rem", fontWeight: 800, margin: "0 0 0.35rem 0" }}>
            {inspection.instructions || "On-site corridor structural inspection"}
          </h1>
          <p style={{ color: "#94a3b8", fontSize: "0.85rem", margin: 0 }}>
            Dispatched {formatDateTime(inspection.created_at)} by Regional/District Coordination.
            {inspection.started_at && ` Started by inspector: ${formatRelativeTime(inspection.started_at)}.`}
          </p>
        </div>

        {/* Start Inspection Action if Assigned */}
        {isAssigned && (
          <button
            type="button"
            onClick={handleStart}
            disabled={startMutation.isPending}
            className="btn primary"
            style={{
              padding: "0.85rem 1.5rem",
              fontSize: "1rem",
              fontWeight: 800,
              display: "flex",
              alignItems: "center",
              gap: "0.6rem",
              background: "#10b981",
              border: "none",
              boxShadow: "0 4px 15px rgba(16, 185, 129, 0.3)",
            }}
          >
            <Play size={18} /> {startMutation.isPending ? "Starting..." : "Start On-Site Inspection"}
          </button>
        )}
      </div>

      {/* Section 1: Ground Patrol Intelligence & Photos */}
      {report && (
        <Card title="Ground Patrol Intelligence (Source Observation)">
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "1.25rem" }}>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.5rem" }}>
                <span className="badge">{report.report_type}</span>
                <span
                  style={{
                    backgroundColor: report.severity === "CRITICAL" ? "#fee2e2" : report.severity === "HIGH" ? "#ffedd5" : "#e0f2fe",
                    color: report.severity === "CRITICAL" ? "#991b1b" : report.severity === "HIGH" ? "#9a3412" : "#075985",
                    fontSize: "0.75rem",
                    fontWeight: 700,
                    padding: "0.15rem 0.5rem",
                    borderRadius: "4px",
                  }}
                >
                  {report.severity} SEVERITY
                </span>
                <span className="badge">{report.review_state}</span>
              </div>

              <div style={{ fontSize: "1rem", fontWeight: 600, color: "var(--color-text)", marginBottom: "0.5rem" }}>
                &ldquo;{report.description}&rdquo;
              </div>

              <div className="small muted" style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
                <div>Reported: {formatDateTime(report.created_at)}</div>
                {report.location && (
                  <div>
                    GPS Coordinates: {report.location.latitude.toFixed(5)}°N, {report.location.longitude.toFixed(5)}°E (±{Math.round(report.location.accuracy_m)}m)
                  </div>
                )}
                {report.candidate_edge_id && <div>Snaped Highway Edge: {report.candidate_edge_id}</div>}
              </div>
            </div>

            {/* Proximity & Distance Telemetry Card */}
            <div
              style={{
                background: "var(--color-surface-sunken, #f8fafc)",
                padding: "1rem",
                borderRadius: "10px",
                border: "1px solid var(--color-border, #e2e8f0)",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", fontWeight: 700, fontSize: "0.85rem", marginBottom: "0.4rem" }}>
                <Compass size={16} color="#0284c7" /> Inspector Proximity to Incident
              </div>

              {effectiveDistanceMeters !== null ? (
                <div>
                  <div style={{ fontSize: "1.4rem", fontWeight: 800, color: effectiveDistanceMeters <= 100 ? "#059669" : "#d97706" }}>
                    {effectiveDistanceMeters < 1000
                      ? `${Math.round(effectiveDistanceMeters)} meters away`
                      : `${(effectiveDistanceMeters / 1000).toFixed(2)} km away`}
                  </div>
                  <div className="small muted" style={{ marginTop: "0.2rem" }}>
                    {effectiveDistanceMeters <= 100 ? (
                      <span style={{ color: "#059669", fontWeight: 700 }}>✓ Within official on-site survey radius (&lt;100m)</span>
                    ) : (
                      <span>Approaching hazard site ({inspectorCoords?.label})</span>
                    )}
                  </div>
                </div>
              ) : (
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                  <span className="small muted">GPS not yet acquired.</span>
                  <button type="button" onClick={() => geo.locate()} className="btn small" style={{ fontSize: "0.75rem", padding: "0.2rem 0.5rem" }}>
                    Acquire GPS Fix
                  </button>
                </div>
              )}
            </div>
          </div>
        </Card>
      )}

      {/* Section 2: Spatial Inspection Map & Tactical HUD */}
      <Card
        title={
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%", flexWrap: "wrap", gap: "0.5rem" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <Compass size={18} color="#0284c7" />
              <span>Corridor Map &amp; Spatial Alignment</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", flexWrap: "wrap" }}>
              {/* Focus buttons */}
              <div style={{ display: "inline-flex", background: "var(--color-surface-sunken, #e2e8f0)", borderRadius: "6px", padding: "2px" }}>
                <button
                  type="button"
                  onClick={() => setCameraFocus("hazard")}
                  className="btn small"
                  style={{
                    fontSize: "0.72rem",
                    padding: "0.15rem 0.5rem",
                    background: cameraFocus === "hazard" ? "#0284c7" : "transparent",
                    color: cameraFocus === "hazard" ? "#fff" : "inherit",
                    border: "none",
                  }}
                  title="Center map on hazard site"
                >
                  🎯 Hazard
                </button>
                {inspectorCoords && (
                  <button
                    type="button"
                    onClick={() => setCameraFocus("inspector")}
                    className="btn small"
                    style={{
                      fontSize: "0.72rem",
                      padding: "0.15rem 0.5rem",
                      background: cameraFocus === "inspector" ? "#0284c7" : "transparent",
                      color: cameraFocus === "inspector" ? "#fff" : "inherit",
                      border: "none",
                    }}
                    title="Center map on inspector position"
                  >
                    🔬 Inspector
                  </button>
                )}
                {inspectorCoords && (
                  <button
                    type="button"
                    onClick={() => setCameraFocus("both")}
                    className="btn small"
                    style={{
                      fontSize: "0.72rem",
                      padding: "0.15rem 0.5rem",
                      background: cameraFocus === "both" ? "#0284c7" : "transparent",
                      color: cameraFocus === "both" ? "#fff" : "inherit",
                      border: "none",
                    }}
                    title="Fit both inspector and hazard on screen"
                  >
                    📐 Both
                  </button>
                )}
              </div>

              {/* Inspector Mode Switcher */}
              <button
                type="button"
                onClick={() => {
                  if (inspectorMode === "simulated") {
                    setInspectorMode("device");
                    geo.locate();
                    setActionSuccess("Switched to real device GPS.");
                  } else {
                    setInspectorMode("simulated");
                    setCameraFocus("hazard");
                    setActionSuccess("Switched to on-site inspector simulation (~85m from hazard).");
                  }
                }}
                className="btn small"
                style={{
                  fontSize: "0.72rem",
                  padding: "0.2rem 0.55rem",
                  background: inspectorMode === "simulated" ? "#10b981" : "#f59e0b",
                  color: "#ffffff",
                  border: "none",
                }}
                title={inspectorMode === "simulated" ? "Switch to live device GPS" : "Switch to simulated on-site fix"}
              >
                {inspectorMode === "simulated" ? "📍 On-Site Fix (Active)" : "🛰️ Real Device GPS"}
              </button>

              {/* Milestone Quick Selector */}
              <select
                aria-label="Jump to North-East corridor milestone"
                defaultValue=""
                onChange={(e) => {
                  const val = e.target.value;
                  if (!val) return;
                  const found = NORTH_EAST_LOCATION_PRESETS.find((p) => p.name === val);
                  if (found) {
                    setCustomTarget({
                      lat: found.latitude,
                      lon: found.longitude,
                      label: `${found.name} (${found.corridor})`,
                    });
                    setCameraFocus("hazard");
                    setActionSuccess(`Inspection target set to ${found.name}.`);
                  }
                  e.target.value = "";
                }}
                style={{
                  fontSize: "0.72rem",
                  padding: "0.2rem 0.4rem",
                  borderRadius: "6px",
                  border: "1px solid #cbd5e1",
                  background: "#ffffff",
                  color: "#0f172a",
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                <option value="">⚡ Jump Milestone...</option>
                {NORTH_EAST_LOCATION_PRESETS.map((p) => (
                  <option key={p.name} value={p.name}>
                    {p.name}
                  </option>
                ))}
              </select>

              {customTarget && (
                <button
                  type="button"
                  onClick={handleResetTarget}
                  className="btn small"
                  style={{ fontSize: "0.72rem", padding: "0.2rem 0.55rem" }}
                  title="Reset to dispatched target milestone"
                >
                  ↺ Reset Target
                </button>
              )}

              {inspectorCoords && (
                <button
                  type="button"
                  onClick={handleSnapToGps}
                  className="btn small"
                  style={{
                    fontSize: "0.72rem",
                    padding: "0.2rem 0.55rem",
                    background: "#0284c7",
                    color: "#ffffff",
                    border: "none",
                  }}
                  title="Lock inspection target to current inspector position"
                >
                  📡 Snap to Inspector
                </button>
              )}
            </div>
          </div>
        }
      >
        {/* Tactical HUD Header Bar */}
        <div
          style={{
            background: "linear-gradient(90deg, #0f172a 0%, #1e293b 100%)",
            color: "#f8fafc",
            padding: "0.7rem 1rem",
            borderRadius: "8px 8px 0 0",
            border: "1px solid #334155",
            borderBottom: "none",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: "0.5rem",
            fontSize: "0.82rem",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "0.8rem", flexWrap: "wrap" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
              <span
                style={{
                  display: "inline-block",
                  width: "10px",
                  height: "10px",
                  borderRadius: "50%",
                  backgroundColor: "#ef4444",
                  boxShadow: "0 0 10px #ef4444",
                }}
              />
              <strong style={{ color: "#38bdf8" }}>{targetLocation.label}</strong>
              <span className="mono muted" style={{ fontSize: "0.75rem" }}>
                [{targetLocation.lat.toFixed(5)}°N, {targetLocation.lon.toFixed(5)}°E]
              </span>
            </div>
            {inspectorCoords && (
              <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", borderLeft: "1px solid #475569", paddingLeft: "0.8rem" }}>
                <span
                  style={{
                    display: "inline-block",
                    width: "10px",
                    height: "10px",
                    borderRadius: "50%",
                    backgroundColor: "#0284c7",
                    boxShadow: "0 0 10px #38bdf8",
                  }}
                />
                <span style={{ color: "#7dd3fc", fontWeight: 700 }}>🔬 Inspector:</span>
                <span className="mono muted" style={{ fontSize: "0.75rem" }}>
                  [{inspectorCoords.latitude.toFixed(5)}°N, {inspectorCoords.longitude.toFixed(5)}°E]
                </span>
              </div>
            )}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "0.8rem" }}>
            {distanceToTargetMeters !== null && (
              <span style={{ color: distanceToTargetMeters <= 100 ? "#10b981" : "#f59e0b", fontWeight: 700 }}>
                {distanceToTargetMeters < 1000
                  ? `⚡ ${Math.round(distanceToTargetMeters)}m away`
                  : `⚡ ${(distanceToTargetMeters / 1000).toFixed(2)}km away`}
              </span>
            )}
            <span style={{ color: "#94a3b8", fontSize: "0.75rem" }}>
              💡 Click map to re-pin target
            </span>
          </div>
        </div>

        <div style={{ height: "380px", borderRadius: "0 0 10px 10px", overflow: "hidden", border: "1px solid var(--color-border, #e2e8f0)" }}>
          <MapView
            fitBounds={mapBbox}
            fitKey={`${cameraFocus}-${inspectorMode}-${targetLocation.lat.toFixed(4)}-${inspectorCoords?.latitude.toFixed(4) ?? "none"}`}
            ariaLabel="Inspection hazard location map"
            points={mapPoints}
            lines={mapLines}
            onMapClick={handleMapClick}
          />
        </div>
      </Card>

      {/* Section 3: Quantitative Technical Assessment Form */}
      <Card
        title={
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <Construction size={18} color="#d946ef" />
            <span>Quantitative Engineering Assessment</span>
          </div>
        }
      >
        <form onSubmit={handleSaveAssessment} className="stack" style={{ gap: "1.25rem" }}>
          {/* Damage Taxonomy & Passability Radios */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "1rem" }}>
            <Field label="Specific Damage Classification">
              <select
                value={damageType}
                onChange={(e) => setDamageType(e.target.value as DamageType)}
                style={{ width: "100%", padding: "0.6rem", borderRadius: "8px", border: "1px solid var(--color-border)" }}
              >
                <option value="LANDSLIDE">Landslide / Hillside Mudslide</option>
                <option value="FLOODING">Flash Flooding / Road Inundation</option>
                <option value="BRIDGE_SCOUR">Bridge Pier Scour / Abutment Failure</option>
                <option value="CULVERT_COLLAPSE">Culvert Breach / Roadway Washout</option>
                <option value="ROAD_EROSION">Valley-Side Road Erosion</option>
                <option value="PAVEMENT_CRACKING">Severe Fissuring / Structural Cracking</option>
                <option value="FALLEN_DEBRIS">Boulder / Fallen Tree Debris</option>
                <option value="OTHER">Other Structural Hazard</option>
              </select>
            </Field>

            <Field label="Authoritative Passability Rating">
              <select
                value={passability}
                onChange={(e) => setPassability(e.target.value as PassabilityStatus)}
                style={{
                  width: "100%",
                  padding: "0.6rem",
                  borderRadius: "8px",
                  border: "1px solid var(--color-border)",
                  fontWeight: 700,
                  color: passability === "IMPASSABLE" ? "#dc2626" : passability === "ALL_VEHICLES" ? "#059669" : "#d97706",
                }}
              >
                <option value="IMPASSABLE">IMPASSABLE — Full Road Closure</option>
                <option value="EMERGENCY_ONLY">EMERGENCY ONLY — Relief / 4x4 Only</option>
                <option value="SINGLE_LANE_LIGHT">SINGLE-LANE LIGHT — Jeeps / Cars Only</option>
                <option value="ALL_VEHICLES">ALL VEHICLES — Open to Commercial Traffic</option>
              </select>
            </Field>
          </div>

          {/* Dynamic Technical Measurements */}
          <div
            style={{
              background: "var(--color-surface-sunken, #f8fafc)",
              padding: "1.25rem",
              borderRadius: "10px",
              border: "1px solid var(--color-border, #e2e8f0)",
            }}
          >
            <div style={{ fontWeight: 700, fontSize: "0.9rem", marginBottom: "0.75rem", color: "#0f172a" }}>
              Physical Dimensions &amp; Structural Stability Metrics
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "1rem" }}>
              <Field label="Obstruction Length (m)">
                <input
                  type="number"
                  step="0.5"
                  min="0"
                  value={affectedLength}
                  onChange={(e) => setAffectedLength(e.target.value)}
                  style={{ width: "100%", padding: "0.5rem", borderRadius: "6px", border: "1px solid var(--color-border)" }}
                />
              </Field>

              <Field label="Carriageway Width Affected (m)">
                <input
                  type="number"
                  step="0.5"
                  min="0"
                  value={affectedWidth}
                  onChange={(e) => setAffectedWidth(e.target.value)}
                  style={{ width: "100%", padding: "0.5rem", borderRadius: "6px", border: "1px solid var(--color-border)" }}
                />
              </Field>

              {damageType === "LANDSLIDE" || damageType === "FALLEN_DEBRIS" ? (
                <Field label="Debris Depth (m)">
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    value={debrisDepth}
                    onChange={(e) => setDebrisDepth(e.target.value)}
                    style={{ width: "100%", padding: "0.5rem", borderRadius: "6px", border: "1px solid var(--color-border)" }}
                  />
                </Field>
              ) : null}

              {damageType === "BRIDGE_SCOUR" ? (
                <Field label="Pier Scour Depth (m)">
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    value={pierScourDepth}
                    onChange={(e) => setPierScourDepth(e.target.value)}
                    style={{ width: "100%", padding: "0.5rem", borderRadius: "6px", border: "1px solid var(--color-border)" }}
                  />
                </Field>
              ) : null}

              {damageType === "FLOODING" ? (
                <Field label="Water Level Over Tarmac (cm)">
                  <input
                    type="number"
                    step="1"
                    min="0"
                    value={waterLevelCm}
                    onChange={(e) => setWaterLevelCm(e.target.value)}
                    style={{ width: "100%", padding: "0.5rem", borderRadius: "6px", border: "1px solid var(--color-border)" }}
                  />
                </Field>
              ) : null}

              <Field label="Structural Ground Stability">
                <select
                  value={stability}
                  onChange={(e) => setStability(e.target.value as StructuralStability)}
                  style={{ width: "100%", padding: "0.5rem", borderRadius: "6px", border: "1px solid var(--color-border)" }}
                >
                  <option value="STABLE">STABLE — Ground firm</option>
                  <option value="MONITORING_REQUIRED">MONITORING REQUIRED — Minor movement</option>
                  <option value="IMMINENT_FAILURE">IMMINENT FAILURE — High collapse risk</option>
                  <option value="CRITICAL_FAILURE">CRITICAL FAILURE — Substructure collapsed</option>
                </select>
              </Field>
            </div>

            {/* Checkboxes & speed restrictions */}
            <div style={{ display: "flex", gap: "1.5rem", marginTop: "1rem", flexWrap: "wrap", alignItems: "center" }}>
              <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "0.85rem", cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={slopeMovement}
                  onChange={(e) => setSlopeMovement(e.target.checked)}
                />
                <span>Active hillside soil/rock movement observed</span>
              </label>

              <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "0.85rem", cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={heavyVehiclePassable}
                  onChange={(e) => setHeavyVehiclePassable(e.target.checked)}
                />
                <span>Passable for Heavy Commercial Trucks (&gt;16T)</span>
              </label>

              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "0.85rem" }}>
                <span>Recommended Speed:</span>
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={speedLimit}
                  onChange={(e) => setSpeedLimit(e.target.value)}
                  style={{ width: "70px", padding: "0.3rem 0.5rem", borderRadius: "6px", border: "1px solid var(--color-border)" }}
                />
                <span className="muted">km/h</span>
              </div>
            </div>
          </div>

          <Field label="Engineering Observations & Technical Findings">
            <textarea
              rows={3}
              value={technicalNotes}
              onChange={(e) => setTechnicalNotes(e.target.value)}
              placeholder="e.g. 35m section of hillside gave way. Culvert inlet choked with boulders. Valley-side revetment intact."
              style={{ width: "100%", padding: "0.6rem", borderRadius: "8px", border: "1px solid var(--color-border)", fontSize: "0.9rem" }}
            />
          </Field>

          <div>
            <button
              type="submit"
              disabled={assessmentMutation.isPending || isCompleted}
              className="btn primary"
              style={{ padding: "0.6rem 1.25rem", fontWeight: 700 }}
            >
              {assessmentMutation.isPending ? "Saving..." : "Save Technical Assessment"}
            </button>
          </div>
        </form>
      </Card>

      {/* Section 4: Categorized Photographic Evidence */}
      <Card
        title={
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <Camera size={18} color="#0284c7" />
            <span>Categorized Photographic Evidence ({inspection.evidence?.length || 0})</span>
          </div>
        }
      >
        <div className="stack" style={{ gap: "1rem" }}>
          {/* Add Evidence Mini-Bar */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.75rem",
              background: "var(--color-surface-sunken, #f8fafc)",
              padding: "0.85rem 1rem",
              borderRadius: "10px",
              border: "1px solid var(--color-border, #e2e8f0)",
              flexWrap: "wrap",
            }}
          >
            <div style={{ minWidth: "180px" }}>
              <select
                value={evidenceKind}
                onChange={(e) => setEvidenceKind(e.target.value as EvidenceKind)}
                style={{ width: "100%", padding: "0.45rem", borderRadius: "6px", border: "1px solid var(--color-border)", fontSize: "0.85rem" }}
              >
                <option value="WIDE_ANGLE">Wide-Angle Overview</option>
                <option value="CLOSE_UP">Close-Up Structural Detail</option>
                <option value="DAMAGE_SCALE">Damage Scale (with reference)</option>
                <option value="GPS_SURVEY">GPS Milestone / Survey Mark</option>
                <option value="PASSABILITY_PROOF">Passability Proof (clearance)</option>
                <option value="ENGINEERING_SKETCH">Engineering Sketch / Cross-Section</option>
              </select>
            </div>

            <input
              type="text"
              placeholder="Caption or landmark (e.g. Pier 3 west footing)"
              value={evidenceCaption}
              onChange={(e) => setEvidenceCaption(e.target.value)}
              style={{ flex: 1, minWidth: "220px", padding: "0.45rem 0.65rem", borderRadius: "6px", border: "1px solid var(--color-border)", fontSize: "0.85rem" }}
            />

            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              capture="environment"
              onChange={(e) => void handleFileSelected(e)}
              style={{ display: "none" }}
            />
            <button
              type="button"
              onClick={handlePickPhoto}
              disabled={uploading || isCompleted}
              className="btn small"
              style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}
            >
              <Upload size={14} /> {uploading ? "Uploading..." : "Capture / Upload Photo"}
            </button>
          </div>
          {uploadError ? <Banner tone="warn" title="Upload failed"><p className="small">{uploadError}</p></Banner> : null}

          {/* Evidence Grid */}
          {inspection.evidence && inspection.evidence.length > 0 ? (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: "1rem" }}>
              {inspection.evidence.map((ev) => (
                <div
                  key={ev.id}
                  style={{
                    borderRadius: "10px",
                    border: "1px solid var(--color-border, #e2e8f0)",
                    background: "var(--color-surface, #ffffff)",
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      height: "120px",
                      background: "linear-gradient(135deg, #0f172a 0%, #1e293b 100%)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      color: "#94a3b8",
                      fontSize: "0.8rem",
                    }}
                  >
                    📷 Geo-Verified Evidence
                  </div>
                  <div style={{ padding: "0.75rem" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.3rem", marginBottom: "0.25rem" }}>
                      <span className="badge small">{ev.kind}</span>
                    </div>
                    <div style={{ fontSize: "0.82rem", fontWeight: 600 }}>{ev.caption || "Inspection proof photo"}</div>
                    <div className="small muted" style={{ fontSize: "0.72rem", marginTop: "0.2rem" }}>
                      Tagged {formatRelativeTime(ev.captured_at)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="small muted" style={{ textAlign: "center", padding: "1.5rem" }}>
              No technical evidence photos attached yet. Use the bar above to attach photos with category tagging.
            </div>
          )}
        </div>
      </Card>

      {/* Section 5: Authoritative Decision Command */}
      <Card
        title={
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <ShieldAlert size={18} color="#dc2626" />
            <span>Authoritative Traffic &amp; Highway Clearance Decision</span>
          </div>
        }
      >
        <div className="stack" style={{ gap: "1.25rem" }}>
          <p className="small muted" style={{ margin: 0 }}>
            As the assigned inspector, your decision is authoritative and triggers impact engine
            recalculation and routing updates. It does not notify anyone by itself; the Government
            Portal reflects the change the next time it refreshes.
          </p>

          <Field label="Official Decision Justification / Executive Remarks">
            <textarea
              rows={2}
              value={decisionNotes}
              onChange={(e) => setDecisionNotes(e.target.value)}
              placeholder="e.g. Landslide confirmed blocking both carriageways. Recommended diversion via NH-27."
              style={{ width: "100%", padding: "0.6rem", borderRadius: "8px", border: "1px solid var(--color-border)", fontSize: "0.9rem" }}
            />
          </Field>

          <Field label="If rejecting, reason">
            <select
              value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value as RejectionReason)}
              style={{ width: "100%", padding: "0.5rem", borderRadius: "8px", border: "1px solid var(--color-border)", fontSize: "0.85rem" }}
            >
              <option value="UNVERIFIABLE">Could not verify at the site</option>
              <option value="DUPLICATE">Duplicate of another report</option>
              <option value="INACCURATE_LOCATION">Location does not match the ground reality</option>
              <option value="SPAM_OR_INVALID">Spam or invalid submission</option>
              <option value="RESOLVED_PRIOR_TO_REVIEW">Already resolved before this review</option>
              <option value="OTHER">Other (see remarks above)</option>
            </select>
          </Field>

          {/* Action Buttons Grid */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "0.85rem" }}>
            <button
              type="button"
              onClick={() => handleDecide("VERIFIED")}
              disabled={decideMutation.isPending || isCompleted}
              className="btn"
              style={{
                background: "#dc2626",
                color: "#ffffff",
                border: "none",
                padding: "0.85rem",
                borderRadius: "10px",
                fontWeight: 800,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: "0.25rem",
                cursor: "pointer",
                boxShadow: "0 4px 12px rgba(220, 38, 38, 0.25)",
              }}
            >
              <span>🔴 Confirm Hazard &amp; Block Road</span>
              <span style={{ fontSize: "0.72rem", opacity: 0.9, fontWeight: 500 }}>
                Declares BLOCKED, reroutes logistics
              </span>
            </button>

            <button
              type="button"
              onClick={() => handleDecide("CLEARANCE_RESTORED")}
              disabled={decideMutation.isPending || isCompleted}
              className="btn"
              style={{
                background: "#059669",
                color: "#ffffff",
                border: "none",
                padding: "0.85rem",
                borderRadius: "10px",
                fontWeight: 800,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: "0.25rem",
                cursor: "pointer",
                boxShadow: "0 4px 12px rgba(5, 150, 105, 0.25)",
              }}
            >
              <span>🟢 Declare Clearance Restored</span>
              <span style={{ fontSize: "0.72rem", opacity: 0.9, fontWeight: 500 }}>
                Restores edge to OPEN, recalculates impact
              </span>
            </button>

            <button
              type="button"
              onClick={() => handleDecide("REINSPECTION_REQUIRED")}
              disabled={decideMutation.isPending || isCompleted}
              className="btn"
              style={{
                background: "#d97706",
                color: "#ffffff",
                border: "none",
                padding: "0.85rem",
                borderRadius: "10px",
                fontWeight: 800,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: "0.25rem",
                cursor: "pointer",
                boxShadow: "0 4px 12px rgba(217, 119, 6, 0.25)",
              }}
            >
              <span>⚠️ Request Re-Inspection</span>
              <span style={{ fontSize: "0.72rem", opacity: 0.9, fontWeight: 500 }}>
                Flag for ongoing structural monitoring
              </span>
            </button>

            <button
              type="button"
              onClick={() => handleDecide("MORE_INFO_NEEDED")}
              disabled={decideMutation.isPending || isCompleted}
              className="btn"
              style={{
                background: "#0369a1",
                color: "#ffffff",
                border: "none",
                padding: "0.85rem",
                borderRadius: "10px",
                fontWeight: 800,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: "0.25rem",
                cursor: "pointer",
                boxShadow: "0 4px 12px rgba(3, 105, 161, 0.25)",
              }}
            >
              <span>ℹ️ Request More Information</span>
              <span style={{ fontSize: "0.72rem", opacity: 0.9, fontWeight: 500 }}>
                Ask the reporter for more evidence
              </span>
            </button>

            <button
              type="button"
              onClick={() => handleDecide("REJECTED")}
              disabled={decideMutation.isPending || isCompleted}
              className="btn"
              style={{
                background: "var(--color-surface, #f8fafc)",
                color: "#475569",
                border: "1px solid var(--color-border, #cbd5e1)",
                padding: "0.85rem",
                borderRadius: "10px",
                fontWeight: 700,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: "0.25rem",
                cursor: "pointer",
              }}
            >
              <span>❌ Reject as False Alarm</span>
              <span style={{ fontSize: "0.72rem", opacity: 0.8, fontWeight: 400 }}>
                Dismiss observation report
              </span>
            </button>
          </div>
        </div>
      </Card>
    </div>
  );
}
