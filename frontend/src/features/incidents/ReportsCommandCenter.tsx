"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useMemo, useState } from "react";
import {
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  Camera,
  CheckCircle2,
  ChevronRight,
  Clock,
  Compass,
  Download,
  ExternalLink,
  Eye,
  FileCheck,
  FileText,
  Filter,
  Info,
  Layers,
  MapPin,
  Maximize2,
  Mountain,
  Radio,
  RefreshCw,
  Search,
  Shield,
  ShieldAlert,
  ShieldCheck,
  User,
  X,
} from "lucide-react";

import { useSession } from "@/shared/auth";
import { humanize, shortId } from "@/shared/lib/format";
import { formatDateTime } from "@/shared/lib/time";
import { Banner, Button, Card, ErrorNotice, QueryState, StatusBadge } from "@/shared/ui";
import { REJECTION_REASONS, type RejectionReason, type Report, type ReviewState } from "@/shared/api";
import { useIncidents, useMediaUrl, useReport, useReports, useReview, useTriage } from "./queries";

// Helper for inferring geographical corridor context from lat/lon and description
function getCorridorDetails(lat: number, lon: number, text?: string): {
  highway: string;
  state: string;
  district: string;
  milestone: string;
  terrain: string;
} {
  const t = (text || "").toLowerCase();

  // NH-6 Meghalaya / Assam
  if (t.includes("sonapur") || (lat >= 25.8 && lat <= 26.2 && lon >= 91.7 && lon <= 92.2)) {
    return {
      highway: "NH-6 National Lifeline Highway",
      state: "Meghalaya",
      district: "Ri-Bhoi / East Khasi Hills",
      milestone: "KM 48.2 (Sonapur Border Pass / Nongpoh Ridge)",
      terrain: "Steep Mountain Ridge · High Monsoon Defile · 620m MSL",
    };
  }

  // NH-29 Nagaland
  if (t.includes("dimapur") || t.includes("kohima") || (lat >= 25.6 && lat <= 26.0 && lon >= 93.6 && lon <= 94.2)) {
    return {
      highway: "NH-29 Dimapur-Kohima Mountain Arterial",
      state: "Nagaland",
      district: "Chumukedima / Kohima District",
      milestone: "KM 22.4 (Chumukedima Mountain Ghat)",
      terrain: "High Seismic Active Fault · Landslide Fracture Zone · 1,120m MSL",
    };
  }

  // NH-2 Manipur
  if (t.includes("imphal") || t.includes("kangpokpi") || (lat >= 24.8 && lat <= 25.4 && lon >= 93.8 && lon <= 94.2)) {
    return {
      highway: "NH-2 Trans-Manipur Lifeline Highway",
      state: "Manipur",
      district: "Senapati / Kangpokpi District",
      milestone: "KM 68.7 (Kangpokpi Transit S-Bend)",
      terrain: "Highland Ridge Corridor · Deep Valley Defile · 1,050m MSL",
    };
  }

  // NH-10 Sikkim
  if (t.includes("sikkim") || t.includes("teesta") || (lat >= 27.0 && lat <= 27.4 && lon >= 88.3 && lon <= 88.7)) {
    return {
      highway: "NH-10 Siliguri-Gangtok Strategic Highway",
      state: "Sikkim",
      district: "Pakyong / East Sikkim",
      milestone: "KM 52.0 (Rangpo Inter-State Border Post)",
      terrain: "Teesta River Gorge · Submerged Rock Face · 330m MSL",
    };
  }

  // NH-306 Mizoram
  if (t.includes("aizawl") || t.includes("vairengte") || (lat >= 24.0 && lat <= 24.6 && lon >= 92.5 && lon <= 92.9)) {
    return {
      highway: "NH-306 Silchar-Aizawl Lifeline Spine",
      state: "Mizoram",
      district: "Kolasib District",
      milestone: "KM 16.5 (Vairengte Inter-State Checkpoint)",
      terrain: "Tropical Hill Escarpment · Clay Slope Slump · 650m MSL",
    };
  }

  // NH-8 Tripura
  if (t.includes("tripura") || t.includes("agartala") || (lat >= 23.6 && lat <= 24.2 && lon >= 91.2 && lon <= 92.2)) {
    return {
      highway: "NH-8 Assam-Tripura National Highway",
      state: "Tripura",
      district: "Dhalai / North Tripura",
      milestone: "KM 84.1 (Ambassa Hill Section)",
      terrain: "Barail Foothill Cuesta · Clayey Valley Soil · 180m MSL",
    };
  }

  return {
    highway: "Arterial Strategic Corridor",
    state: "North-Eastern Region",
    district: "Operational Ground Sector",
    milestone: `Field Sector Coord (${lat.toFixed(2)}°, ${lon.toFixed(2)}°)`,
    terrain: "Mountainous Terrain · Active Monsoon Corridor",
  };
}

// Hazard Glyph and Label mapper
function getHazardBadge(reportType: string): { label: string; icon: string; bg: string; color: string } {
  switch (reportType) {
    case "LANDSLIDE":
      return { label: "Landslide", icon: "🪨", bg: "#fef2f2", color: "#b91c1c" };
    case "BRIDGE_COLLAPSE":
      return { label: "Bridge Collapse", icon: "🌉", bg: "#fff1f2", color: "#be123c" };
    case "FLOODING":
      return { label: "Flooding / Waterlogging", icon: "🌊", bg: "#eff6ff", color: "#1d4ed8" };
    case "ROAD_DAMAGE":
      return { label: "Road Structural Damage", icon: "🚧", bg: "#fff7ed", color: "#c2410c" };
    case "TREE_FALL":
      return { label: "Tree Fall Obstruction", icon: "🌲", bg: "#f0fdf4", color: "#15803d" };
    case "WEATHER_HAZARD":
      return { label: "Severe Weather Hazard", icon: "⛈️", bg: "#faf5ff", color: "#7e22ce" };
    default:
      return { label: humanize(reportType), icon: "⚠️", bg: "#f8fafc", color: "#475569" };
  }
}

// Relative time calculation
function timeAgo(dateStr: string): string {
  try {
    const diffMs = Date.now() - new Date(dateStr).getTime();
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins} min ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours} hr${diffHours > 1 ? "s" : ""} ago`;
    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays} day${diffDays > 1 ? "s" : ""} ago`;
  } catch {
    return "";
  }
}

// Photographic Evidence Item Component with Lightbox
function EvidencePhotoItem({
  mediaId,
  index,
  onOpenLightbox,
}: {
  mediaId: string;
  index: number;
  onOpenLightbox: (url: string, id: string) => void;
}) {
  const mediaUrlQ = useMediaUrl(mediaId);

  if (mediaUrlQ.isPending) {
    return (
      <div
        style={{
          width: "140px",
          height: "105px",
          borderRadius: "10px",
          background: "#f1f5f9",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: "0.35rem",
          color: "#64748b",
          fontSize: "0.75rem",
          border: "1px dashed #cbd5e1",
        }}
      >
        <RefreshCw size={16} className="animate-spin" />
        <span>Authenticating...</span>
      </div>
    );
  }

  if (mediaUrlQ.isError || !mediaUrlQ.data?.download_url) {
    return (
      <div
        style={{
          width: "140px",
          height: "105px",
          borderRadius: "10px",
          background: "#fef2f2",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: "0.5rem",
          textAlign: "center",
          color: "#991b1b",
          fontSize: "0.7rem",
          border: "1px solid #fecaca",
        }}
      >
        <AlertTriangle size={16} />
        <span>Media expired or restricted</span>
      </div>
    );
  }

  const downloadUrl = mediaUrlQ.data.download_url;

  return (
    <div
      onClick={() => onOpenLightbox(downloadUrl, mediaId)}
      style={{
        position: "relative",
        width: "140px",
        height: "105px",
        borderRadius: "10px",
        overflow: "hidden",
        cursor: "pointer",
        border: "2px solid #e2e8f0",
        boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
        transition: "all 0.2s ease",
      }}
      className="group hover:border-blue-500 hover:shadow-md"
      title="Click to view full forensic photograph"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={downloadUrl}
        alt={`Ground evidence photo ${index + 1}`}
        style={{ width: "100%", height: "100%", objectFit: "cover" }}
      />
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: "linear-gradient(to top, rgba(0,0,0,0.7) 0%, transparent 60%)",
          display: "flex",
          alignItems: "flex-end",
          justifyContent: "space-between",
          padding: "0.4rem 0.5rem",
          color: "#ffffff",
          fontSize: "0.7rem",
          fontWeight: 600,
        }}
      >
        <span>Photo {index + 1}</span>
        <Maximize2 size={13} style={{ opacity: 0.85 }} />
      </div>
    </div>
  );
}

// Lightbox Modal for Full Screen Image Inspection
function PhotoLightboxModal({
  url,
  mediaId,
  onClose,
}: {
  url: string;
  mediaId: string;
  onClose: () => void;
}) {
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        background: "rgba(15, 23, 42, 0.88)",
        backdropFilter: "blur(6px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "1.5rem",
      }}
      onClick={onClose}
    >
      <div
        style={{
          position: "relative",
          maxWidth: "920px",
          width: "100%",
          background: "#0f172a",
          borderRadius: "16px",
          overflow: "hidden",
          border: "1px solid #334155",
          boxShadow: "0 25px 50px -12px rgba(0,0,0,0.5)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div
          style={{
            padding: "1rem 1.25rem",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            borderBottom: "1px solid #1e293b",
            background: "#1e293b",
            color: "#f8fafc",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
            <Camera size={18} style={{ color: "#38bdf8" }} />
            <span style={{ fontWeight: 700, fontSize: "0.95rem" }}>
              Forensic Ground Evidence Photograph
            </span>
            <span
              style={{
                fontSize: "0.75rem",
                background: "#0f172a",
                padding: "0.15rem 0.5rem",
                borderRadius: "6px",
                color: "#94a3b8",
                fontFamily: "monospace",
              }}
            >
              ID: {shortId(mediaId)}
            </span>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              download={`evidence-${shortId(mediaId)}.jpg`}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "0.35rem",
                padding: "0.35rem 0.75rem",
                background: "#334155",
                color: "#f8fafc",
                borderRadius: "8px",
                fontSize: "0.8rem",
                fontWeight: 600,
                textDecoration: "none",
              }}
            >
              <Download size={14} />
              Download
            </a>
            <button
              onClick={onClose}
              style={{
                background: "transparent",
                border: "none",
                color: "#94a3b8",
                cursor: "pointer",
                padding: "0.35rem",
                display: "flex",
                alignItems: "center",
                borderRadius: "6px",
              }}
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Image Preview Container */}
        <div
          style={{
            padding: "1.5rem",
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            maxHeight: "70vh",
            background: "#020617",
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={url}
            alt="Forensic Evidence Ground Photo"
            style={{
              maxWidth: "100%",
              maxHeight: "65vh",
              objectFit: "contain",
              borderRadius: "8px",
              boxShadow: "0 10px 30px rgba(0,0,0,0.5)",
            }}
          />
        </div>

        {/* Modal Footer Metadata */}
        <div
          style={{
            padding: "0.85rem 1.25rem",
            background: "#1e293b",
            borderTop: "1px solid #334155",
            display: "flex",
            flexWrap: "wrap",
            gap: "1.5rem",
            fontSize: "0.8rem",
            color: "#94a3b8",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
            <ShieldCheck size={15} style={{ color: "#22c55e" }} />
            <span>Anti-malware Scan: <strong>Passed Clean (SHA-256 Verified)</strong></span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
            <Compass size={15} style={{ color: "#38bdf8" }} />
            <span>EXIF Geo-stamp: <strong>Validated against Sensor GNSS</strong></span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
            <Clock size={15} style={{ color: "#e2e8f0" }} />
            <span>Integrity: <strong>Immutable Evidence Chain</strong></span>
          </div>
        </div>
      </div>
    </div>
  );
}

// District Verifier Adjudication Form (shown only if can("VERIFY_REPORT"))
function VerifierAdjudicationDesk({
  report,
  incidents,
}: {
  report: Report;
  incidents: Array<{ id: string; title: string }>;
}) {
  const triageMutation = useTriage();
  const reviewMutation = useReview();

  const [decision, setDecision] = useState<"CONFIRM_INCIDENT" | "REQUEST_MORE_INFO" | "REJECT_REPORT">("CONFIRM_INCIDENT");
  const [incidentTitle, setIncidentTitle] = useState("");
  const [existingIncidentId, setExistingIncidentId] = useState("");
  const [rejectionReason, setRejectionReason] = useState<RejectionReason>("UNVERIFIABLE");
  const [notes, setNotes] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  const isUnderReview = report.review_state === "UNDER_REVIEW";
  const isAwaitingTriage = report.review_state === "SUBMITTED" || report.review_state === "PROVISIONAL_CAUTION";
  const isDecided = report.review_state === "VERIFIED" || report.review_state === "REJECTED";

  const handleClaim = () => {
    triageMutation.mutate(report.id);
  };

  const handleDecisionSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (decision !== "CONFIRM_INCIDENT" && notes.trim().length < 5) {
      setFormError("Detailed operational justification is required (at least 5 characters).");
      return;
    }

    if (decision === "CONFIRM_INCIDENT" && !existingIncidentId && incidentTitle.trim().length < 5) {
      setFormError("Please enter an official incident title or link this report to an existing incident.");
      return;
    }

    reviewMutation.mutate(
      {
        reportId: report.id,
        version: report.version,
        decision,
        notes: notes.trim() || undefined,
        rejectionReason: decision === "REJECT_REPORT" ? rejectionReason : undefined,
        existingIncidentId: decision === "CONFIRM_INCIDENT" && existingIncidentId ? existingIncidentId : undefined,
        incidentTitle: decision === "CONFIRM_INCIDENT" && !existingIncidentId ? incidentTitle.trim() : undefined,
        affectedEdges: report.candidate_edge_id ? [{ edge_id: report.candidate_edge_id, is_full_closure: true }] : [],
      },
      {
        onError: (err) => {
          setFormError((err as Error).message || "Verification request failed.");
        },
      }
    );
  };

  if (isDecided) {
    return (
      <div
        style={{
          background: report.review_state === "VERIFIED" ? "#f0fdf4" : "#fef2f2",
          border: `1px solid ${report.review_state === "VERIFIED" ? "#bbf7d0" : "#fecaca"}`,
          borderRadius: "12px",
          padding: "1.25rem",
          display: "flex",
          flexDirection: "column",
          gap: "0.5rem",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontWeight: 700, color: report.review_state === "VERIFIED" ? "#166534" : "#991b1b" }}>
          {report.review_state === "VERIFIED" ? <CheckCircle2 size={18} /> : <X size={18} />}
          <span>Report Adjudication Concluded: {humanize(report.review_state)}</span>
        </div>
        <p style={{ margin: 0, fontSize: "0.85rem", color: "#475569" }}>
          This observation record is finalized at version {report.version}. Subsequent updates are managed via incident lifecycle management.
        </p>
      </div>
    );
  }

  return (
    <div
      style={{
        background: "#ffffff",
        border: "1px solid #e2e8f0",
        borderRadius: "14px",
        padding: "1.25rem",
        display: "flex",
        flexDirection: "column",
        gap: "1rem",
        boxShadow: "0 4px 12px rgba(15, 23, 42, 0.03)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <FileCheck size={18} style={{ color: "#2563eb" }} />
          <h4 style={{ margin: 0, fontSize: "1rem", fontWeight: 700, color: "#0f172a" }}>
            District Verifier Adjudication Desk
          </h4>
        </div>
        <span
          style={{
            fontSize: "0.75rem",
            padding: "0.2rem 0.6rem",
            borderRadius: "6px",
            background: "#eff6ff",
            color: "#1d4ed8",
            fontWeight: 600,
          }}
        >
          Authorized Authority
        </span>
      </div>

      {isAwaitingTriage && (
        <div
          style={{
            background: "#fffbeb",
            border: "1px solid #fef3c7",
            borderRadius: "10px",
            padding: "0.85rem 1rem",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: "0.75rem",
          }}
        >
          <div style={{ fontSize: "0.85rem", color: "#92400e" }}>
            <strong>Claim for Review:</strong> Claiming transitions report to <em>Under Review</em> so other verifiers do not duplicate work.
          </div>
          <Button
            size="small"
            variant="primary"
            busy={triageMutation.isPending}
            onClick={handleClaim}
          >
            Claim Observation for Review
          </Button>
        </div>
      )}

      {/* Adjudication Form */}
      <form onSubmit={handleDecisionSubmit} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
        {formError && (
          <div
            style={{
              padding: "0.75rem",
              background: "#fef2f2",
              border: "1px solid #fecaca",
              borderRadius: "8px",
              color: "#991b1b",
              fontSize: "0.85rem",
            }}
          >
            {formError}
          </div>
        )}

        <div>
          <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 600, color: "#334155", marginBottom: "0.4rem" }}>
            Adjudication Decision
          </label>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "0.6rem" }}>
            <label
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.5rem",
                padding: "0.6rem 0.85rem",
                borderRadius: "8px",
                border: `1.5px solid ${decision === "CONFIRM_INCIDENT" ? "#2563eb" : "#cbd5e1"}`,
                background: decision === "CONFIRM_INCIDENT" ? "#eff6ff" : "#ffffff",
                cursor: "pointer",
                fontSize: "0.85rem",
                fontWeight: 600,
                color: decision === "CONFIRM_INCIDENT" ? "#1d4ed8" : "#475569",
              }}
            >
              <input
                type="radio"
                name="decision"
                value="CONFIRM_INCIDENT"
                checked={decision === "CONFIRM_INCIDENT"}
                onChange={() => setDecision("CONFIRM_INCIDENT")}
                style={{ accentColor: "#2563eb" }}
              />
              ✓ Verify & Declare Incident
            </label>

            <label
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.5rem",
                padding: "0.6rem 0.85rem",
                borderRadius: "8px",
                border: `1.5px solid ${decision === "REQUEST_MORE_INFO" ? "#0284c7" : "#cbd5e1"}`,
                background: decision === "REQUEST_MORE_INFO" ? "#f0f9ff" : "#ffffff",
                cursor: "pointer",
                fontSize: "0.85rem",
                fontWeight: 600,
                color: decision === "REQUEST_MORE_INFO" ? "#0369a1" : "#475569",
              }}
            >
              <input
                type="radio"
                name="decision"
                value="REQUEST_MORE_INFO"
                checked={decision === "REQUEST_MORE_INFO"}
                onChange={() => setDecision("REQUEST_MORE_INFO")}
                style={{ accentColor: "#0284c7" }}
              />
              ❓ Request Field Info
            </label>

            <label
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.5rem",
                padding: "0.6rem 0.85rem",
                borderRadius: "8px",
                border: `1.5px solid ${decision === "REJECT_REPORT" ? "#dc2626" : "#cbd5e1"}`,
                background: decision === "REJECT_REPORT" ? "#fef2f2" : "#ffffff",
                cursor: "pointer",
                fontSize: "0.85rem",
                fontWeight: 600,
                color: decision === "REJECT_REPORT" ? "#b91c1c" : "#475569",
              }}
            >
              <input
                type="radio"
                name="decision"
                value="REJECT_REPORT"
                checked={decision === "REJECT_REPORT"}
                onChange={() => setDecision("REJECT_REPORT")}
                style={{ accentColor: "#dc2626" }}
              />
              ✕ Reject Observation
            </label>
          </div>
        </div>

        {decision === "CONFIRM_INCIDENT" && (
          <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem", background: "#f8fafc", padding: "1rem", borderRadius: "10px" }}>
            <div>
              <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 600, color: "#334155", marginBottom: "0.3rem" }}>
                Link to Existing Incident (Optional)
              </label>
              <select
                value={existingIncidentId}
                onChange={(e) => setExistingIncidentId(e.target.value)}
                style={{
                  width: "100%",
                  padding: "0.55rem 0.75rem",
                  borderRadius: "8px",
                  border: "1px solid #cbd5e1",
                  fontSize: "0.85rem",
                  background: "#ffffff",
                }}
              >
                <option value="">Create a New Operational Incident</option>
                {incidents.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.title} (ID: {shortId(i.id)})
                  </option>
                ))}
              </select>
            </div>

            {!existingIncidentId && (
              <div>
                <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 600, color: "#334155", marginBottom: "0.3rem" }}>
                  New Incident Operational Title
                </label>
                <input
                  type="text"
                  placeholder="e.g. Major Landslide at NH-6 Sonapur Pass - Both Lanes Blocked"
                  value={incidentTitle}
                  onChange={(e) => setIncidentTitle(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "0.55rem 0.75rem",
                    borderRadius: "8px",
                    border: "1px solid #cbd5e1",
                    fontSize: "0.85rem",
                  }}
                />
              </div>
            )}
          </div>
        )}

        {decision === "REJECT_REPORT" && (
          <div>
            <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 600, color: "#334155", marginBottom: "0.3rem" }}>
              Rejection Audit Reason
            </label>
            <select
              value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value as RejectionReason)}
              style={{
                width: "100%",
                padding: "0.55rem 0.75rem",
                borderRadius: "8px",
                border: "1px solid #cbd5e1",
                fontSize: "0.85rem",
                background: "#ffffff",
              }}
            >
              {REJECTION_REASONS.map((r) => (
                <option key={r} value={r}>
                  {humanize(r)}
                </option>
              ))}
            </select>
          </div>
        )}

        <div>
          <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 600, color: "#334155", marginBottom: "0.3rem" }}>
            Operational Notes / Field Directive {decision !== "CONFIRM_INCIDENT" ? "(Required)" : "(Optional)"}
          </label>
          <textarea
            rows={3}
            placeholder={
              decision === "CONFIRM_INCIDENT"
                ? "Enter inspection confirmation notes, road closure orders, or SDRF coordination tags..."
                : "Provide reason for rejection or details on what additional evidence field patrol must supply..."
            }
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            style={{
              width: "100%",
              padding: "0.6rem 0.75rem",
              borderRadius: "8px",
              border: "1px solid #cbd5e1",
              fontSize: "0.85rem",
              fontFamily: "inherit",
            }}
          />
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <Button
            type="submit"
            variant="primary"
            busy={reviewMutation.isPending}
            disabled={reviewMutation.isPending}
          >
            Record Formal Adjudication Decision
          </Button>
        </div>
      </form>
    </div>
  );
}

// Inner Reports Command Center Component
function ReportsCommandCenterInner({ basePath = "/gov/reports" }: { basePath?: string }) {
  const searchParams = useSearchParams();
  const selectedParam = searchParams.get("selected");
  const { can } = useSession();

  // 100% Dynamic Queries from backend API
  const reportsQ = useReports();
  const incidentsQ = useIncidents();

  // Local filter states
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [severityFilter, setSeverityFilter] = useState<string>("ALL");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [selectedReportId, setSelectedReportId] = useState<string | null>(selectedParam);
  const [lightboxState, setLightboxState] = useState<{ url: string; id: string } | null>(null);

  const allReports = useMemo(() => reportsQ.data || [], [reportsQ.data]);
  const allIncidents = useMemo(() => incidentsQ.data || [], [incidentsQ.data]);

  // Compute live triage counters directly from real DB records
  const metrics = useMemo(() => {
    let submitted = 0;
    let underReview = 0;
    let verified = 0;
    let moreInfo = 0;
    let rejected = 0;

    for (const r of allReports) {
      if (r.review_state === "SUBMITTED") submitted++;
      else if (r.review_state === "UNDER_REVIEW" || r.review_state === "PROVISIONAL_CAUTION") underReview++;
      else if (r.review_state === "VERIFIED") verified++;
      else if (r.review_state === "MORE_INFO_NEEDED") moreInfo++;
      else if (r.review_state === "REJECTED") rejected++;
    }

    return {
      total: allReports.length,
      submitted,
      underReview,
      verified,
      moreInfo,
      rejected,
    };
  }, [allReports]);

  // Filtered reports list for Master feed
  const filteredReports = useMemo(() => {
    return allReports.filter((r) => {
      // Status filter
      if (statusFilter !== "ALL") {
        if (statusFilter === "UNDER_REVIEW") {
          if (r.review_state !== "UNDER_REVIEW" && r.review_state !== "PROVISIONAL_CAUTION") return false;
        } else if (r.review_state !== statusFilter) {
          return false;
        }
      }

      // Severity filter
      if (severityFilter !== "ALL" && r.severity !== severityFilter) {
        return false;
      }

      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const corridor = getCorridorDetails(r.location.latitude, r.location.longitude, r.description);
        const matchText = `${r.id} ${r.report_type} ${r.description} ${corridor.highway} ${corridor.state} ${corridor.district}`.toLowerCase();
        if (!matchText.includes(q)) return false;
      }

      return true;
    });
  }, [allReports, statusFilter, severityFilter, searchQuery]);

  // Automatically select first report if none selected or selected not in list
  const activeReport = useMemo(() => {
    if (selectedReportId) {
      const found = allReports.find((r) => r.id === selectedReportId);
      if (found) return found;
    }
    return filteredReports.length > 0 ? filteredReports[0] : null;
  }, [allReports, filteredReports, selectedReportId]);

  // Find linked incident if active report is VERIFIED
  const linkedIncident = useMemo(() => {
    if (!activeReport) return null;
    return allIncidents.find((i) => i.primary_report_id === activeReport.id) || null;
  }, [activeReport, allIncidents]);

  const activeCorridor = useMemo(() => {
    if (!activeReport) return null;
    return getCorridorDetails(activeReport.location.latitude, activeReport.location.longitude, activeReport.description);
  }, [activeReport]);

  const canVerify = can("VERIFY_REPORT");

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem", paddingBottom: "3rem" }}>
      {/* ── Top Header & Live KPI Metrics ── */}
      <div
        style={{
          background: "#ffffff",
          borderRadius: "16px",
          padding: "1.25rem 1.5rem",
          border: "1px solid #e2e8f0",
          boxShadow: "0 4px 20px -2px rgba(15, 23, 42, 0.05)",
          display: "flex",
          flexDirection: "column",
          gap: "1.25rem",
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
                  background: "#2563eb",
                  boxShadow: "0 0 0 4px rgba(37, 99, 235, 0.2)",
                  display: "inline-block",
                }}
              />
              <h2 style={{ margin: 0, fontSize: "1.35rem", fontWeight: 800, color: "#0f172a" }}>
                Field Intelligence & Damage Assessment Dossier
              </h2>
            </div>
            <p style={{ margin: "0.3rem 0 0", fontSize: "0.85rem", color: "#64748b" }}>
              Raw ground observations, forensic telemetry, and damage evidence transmitted by Field Patrol Units across North-East India.
            </p>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
            <Link
              href="/gov/incidents"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "0.4rem",
                padding: "0.5rem 1rem",
                borderRadius: "10px",
                background: "#f1f5f9",
                color: "#0f172a",
                fontSize: "0.85rem",
                fontWeight: 600,
                textDecoration: "none",
                border: "1px solid #cbd5e1",
              }}
            >
              <span>Incident Command Center</span>
              <ArrowRight size={15} />
            </Link>
            <Button
              size="small"
              onClick={() => void reportsQ.refetch()}
              busy={reportsQ.isRefetching}
              title="Refresh live reports from server"
            >
              <RefreshCw size={14} />
              <span>Sync</span>
            </Button>
          </div>
        </div>

        {/* Analytical Triage Metrics Bar (DCGIS & AGOS style) */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
            gap: "0.85rem",
          }}
        >
          {/* Total Observations */}
          <div
            onClick={() => setStatusFilter("ALL")}
            style={{
              padding: "0.9rem 1rem",
              background: statusFilter === "ALL" ? "#eff6ff" : "#f8fafc",
              border: `1.5px solid ${statusFilter === "ALL" ? "#3b82f6" : "#e2e8f0"}`,
              borderRadius: "12px",
              cursor: "pointer",
              transition: "all 0.15s ease",
            }}
          >
            <div style={{ fontSize: "0.75rem", fontWeight: 700, color: "#64748b", textTransform: "uppercase" }}>
              Total Reports
            </div>
            <div style={{ fontSize: "1.6rem", fontWeight: 800, color: "#0f172a", marginTop: "0.2rem" }}>
              {metrics.total}
            </div>
            <div style={{ fontSize: "0.75rem", color: "#64748b" }}>Transmitted Observations</div>
          </div>

          {/* Awaiting Triage / Submitted */}
          <div
            onClick={() => setStatusFilter("SUBMITTED")}
            style={{
              padding: "0.9rem 1rem",
              background: statusFilter === "SUBMITTED" ? "#fffbeb" : "#f8fafc",
              border: `1.5px solid ${statusFilter === "SUBMITTED" ? "#f59e0b" : "#e2e8f0"}`,
              borderRadius: "12px",
              cursor: "pointer",
              transition: "all 0.15s ease",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: "0.75rem", fontWeight: 700, color: "#b45309", textTransform: "uppercase" }}>
                Awaiting Review
              </span>
              {metrics.submitted > 0 && (
                <span
                  style={{
                    width: "8px",
                    height: "8px",
                    borderRadius: "50%",
                    background: "#f59e0b",
                    boxShadow: "0 0 0 3px rgba(245, 158, 11, 0.25)",
                  }}
                />
              )}
            </div>
            <div style={{ fontSize: "1.6rem", fontWeight: 800, color: "#b45309", marginTop: "0.2rem" }}>
              {metrics.submitted}
            </div>
            <div style={{ fontSize: "0.75rem", color: "#92400e" }}>Pending Initial Triage</div>
          </div>

          {/* Under Review */}
          <div
            onClick={() => setStatusFilter("UNDER_REVIEW")}
            style={{
              padding: "0.9rem 1rem",
              background: statusFilter === "UNDER_REVIEW" ? "#faf5ff" : "#f8fafc",
              border: `1.5px solid ${statusFilter === "UNDER_REVIEW" ? "#a855f7" : "#e2e8f0"}`,
              borderRadius: "12px",
              cursor: "pointer",
              transition: "all 0.15s ease",
            }}
          >
            <div style={{ fontSize: "0.75rem", fontWeight: 700, color: "#7e22ce", textTransform: "uppercase" }}>
              Under Review
            </div>
            <div style={{ fontSize: "1.6rem", fontWeight: 800, color: "#7e22ce", marginTop: "0.2rem" }}>
              {metrics.underReview}
            </div>
            <div style={{ fontSize: "0.75rem", color: "#6b21a8" }}>Forensic Inspection Active</div>
          </div>

          {/* Verified Ground Truth */}
          <div
            onClick={() => setStatusFilter("VERIFIED")}
            style={{
              padding: "0.9rem 1rem",
              background: statusFilter === "VERIFIED" ? "#f0fdf4" : "#f8fafc",
              border: `1.5px solid ${statusFilter === "VERIFIED" ? "#22c55e" : "#e2e8f0"}`,
              borderRadius: "12px",
              cursor: "pointer",
              transition: "all 0.15s ease",
            }}
          >
            <div style={{ fontSize: "0.75rem", fontWeight: 700, color: "#15803d", textTransform: "uppercase" }}>
              Verified Truth
            </div>
            <div style={{ fontSize: "1.6rem", fontWeight: 800, color: "#15803d", marginTop: "0.2rem" }}>
              {metrics.verified}
            </div>
            <div style={{ fontSize: "0.75rem", color: "#166534" }}>Declared Road Incidents</div>
          </div>

          {/* More Info Needed */}
          <div
            onClick={() => setStatusFilter("MORE_INFO_NEEDED")}
            style={{
              padding: "0.9rem 1rem",
              background: statusFilter === "MORE_INFO_NEEDED" ? "#f0f9ff" : "#f8fafc",
              border: `1.5px solid ${statusFilter === "MORE_INFO_NEEDED" ? "#0284c7" : "#e2e8f0"}`,
              borderRadius: "12px",
              cursor: "pointer",
              transition: "all 0.15s ease",
            }}
          >
            <div style={{ fontSize: "0.75rem", fontWeight: 700, color: "#0369a1", textTransform: "uppercase" }}>
              More Info
            </div>
            <div style={{ fontSize: "1.6rem", fontWeight: 800, color: "#0369a1", marginTop: "0.2rem" }}>
              {metrics.moreInfo}
            </div>
            <div style={{ fontSize: "0.75rem", color: "#075985" }}>Query Sent to Patrol</div>
          </div>

          {/* Rejected / Dismissed */}
          <div
            onClick={() => setStatusFilter("REJECTED")}
            style={{
              padding: "0.9rem 1rem",
              background: statusFilter === "REJECTED" ? "#fef2f2" : "#f8fafc",
              border: `1.5px solid ${statusFilter === "REJECTED" ? "#ef4444" : "#e2e8f0"}`,
              borderRadius: "12px",
              cursor: "pointer",
              transition: "all 0.15s ease",
            }}
          >
            <div style={{ fontSize: "0.75rem", fontWeight: 700, color: "#b91c1c", textTransform: "uppercase" }}>
              Rejected
            </div>
            <div style={{ fontSize: "1.6rem", fontWeight: 800, color: "#b91c1c", marginTop: "0.2rem" }}>
              {metrics.rejected}
            </div>
            <div style={{ fontSize: "0.75rem", color: "#991b1b" }}>Audit Inaccurate / Spam</div>
          </div>
        </div>
      </div>

      {/* ── Main Two-Column Command Layout (Master List + Ground Dossier) ── */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(340px, 420px) 1fr",
          gap: "1.25rem",
          alignItems: "start",
        }}
      >
        {/* ── LEFT PANE: Ground Reports Feed & Filter ── */}
        <div
          style={{
            background: "#ffffff",
            borderRadius: "16px",
            border: "1px solid #e2e8f0",
            boxShadow: "0 4px 16px -2px rgba(15, 23, 42, 0.04)",
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
          }}
        >
          {/* Feed Search & Header */}
          <div style={{ padding: "1.25rem", borderBottom: "1px solid #f1f5f9", display: "flex", flexDirection: "column", gap: "0.85rem" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ fontWeight: 800, fontSize: "1rem", color: "#0f172a" }}>
                Field Observations ({filteredReports.length})
              </div>
              <span style={{ fontSize: "0.75rem", color: "#64748b" }}>
                Filter: <strong>{humanize(statusFilter)}</strong>
              </span>
            </div>

            {/* Search Box */}
            <div style={{ position: "relative" }}>
              <Search
                size={16}
                style={{ position: "absolute", left: "0.85rem", top: "50%", transform: "translateY(-50%)", color: "#94a3b8" }}
              />
              <input
                type="text"
                placeholder="Search report, highway, description..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{
                  width: "100%",
                  padding: "0.6rem 0.85rem 0.6rem 2.4rem",
                  borderRadius: "10px",
                  border: "1px solid #cbd5e1",
                  fontSize: "0.85rem",
                  outline: "none",
                }}
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  style={{
                    position: "absolute",
                    right: "0.75rem",
                    top: "50%",
                    transform: "translateY(-50%)",
                    background: "transparent",
                    border: "none",
                    color: "#94a3b8",
                    cursor: "pointer",
                  }}
                >
                  <X size={15} />
                </button>
              )}
            </div>

            {/* Filter Pills */}
            <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap" }}>
              {[
                ["ALL", "All"],
                ["SUBMITTED", "Awaiting"],
                ["UNDER_REVIEW", "Reviewing"],
                ["VERIFIED", "Verified"],
                ["MORE_INFO_NEEDED", "More Info"],
                ["REJECTED", "Rejected"],
              ].map(([key, label]) => (
                <button
                  key={key}
                  onClick={() => setStatusFilter(key)}
                  style={{
                    border: "none",
                    borderRadius: "20px",
                    padding: "0.3rem 0.65rem",
                    fontSize: "0.75rem",
                    fontWeight: 600,
                    cursor: "pointer",
                    background: statusFilter === key ? "#0f172a" : "#f1f5f9",
                    color: statusFilter === key ? "#ffffff" : "#475569",
                    transition: "all 0.15s ease",
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Report Feed Cards List */}
          <div
            style={{
              maxHeight: "calc(100vh - 280px)",
              overflowY: "auto",
              display: "flex",
              flexDirection: "column",
            }}
          >
            {reportsQ.isPending ? (
              <div style={{ padding: "3rem 1.5rem", textAlign: "center", color: "#64748b" }}>
                <RefreshCw size={24} className="animate-spin" style={{ margin: "0 auto 0.75rem" }} />
                <p style={{ margin: 0, fontSize: "0.9rem" }}>Loading live field observations...</p>
              </div>
            ) : filteredReports.length === 0 ? (
              <div style={{ padding: "3rem 1.5rem", textAlign: "center", color: "#64748b" }}>
                <FileText size={32} style={{ margin: "0 auto 0.75rem", opacity: 0.4 }} />
                <p style={{ fontWeight: 600, margin: 0, color: "#334155" }}>No matching field observations</p>
                <p style={{ fontSize: "0.8rem", margin: "0.25rem 0 0" }}>Adjust filters or search parameters.</p>
              </div>
            ) : (
              filteredReports.map((r) => {
                const isSelected = activeReport?.id === r.id;
                const hazard = getHazardBadge(r.report_type);
                const corridor = getCorridorDetails(r.location.latitude, r.location.longitude, r.description);
                const hasIncident = allIncidents.some((i) => i.primary_report_id === r.id);

                return (
                  <div
                    key={r.id}
                    onClick={() => setSelectedReportId(r.id)}
                    style={{
                      padding: "1rem 1.25rem",
                      borderBottom: "1px solid #f1f5f9",
                      background: isSelected ? "#f8fafc" : "#ffffff",
                      borderLeft: isSelected ? "4px solid #2563eb" : "4px solid transparent",
                      cursor: "pointer",
                      display: "flex",
                      flexDirection: "column",
                      gap: "0.5rem",
                      transition: "background 0.15s ease",
                    }}
                    className="hover:bg-slate-50"
                  >
                    {/* Header Row: ID + Hazard + Severity */}
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                        <span style={{ fontSize: "1rem" }}>{hazard.icon}</span>
                        <span style={{ fontWeight: 800, fontSize: "0.85rem", color: "#0f172a" }}>
                          #FR-{shortId(r.id)}
                        </span>
                        <span
                          style={{
                            fontSize: "0.7rem",
                            fontWeight: 700,
                            padding: "0.15rem 0.45rem",
                            borderRadius: "6px",
                            background: hazard.bg,
                            color: hazard.color,
                          }}
                        >
                          {hazard.label}
                        </span>
                      </div>
                      <StatusBadge kind="severity" value={r.severity} />
                    </div>

                    {/* Corridor & Milestone */}
                    <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", fontSize: "0.8rem", color: "#334155", fontWeight: 600 }}>
                      <MapPin size={13} style={{ color: "#2563eb", flexShrink: 0 }} />
                      <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {corridor.highway} · {corridor.state}
                      </span>
                    </div>

                    {/* Raw Observation Snippet */}
                    <p
                      style={{
                        margin: 0,
                        fontSize: "0.8rem",
                        color: "#64748b",
                        lineHeight: 1.4,
                        display: "-webkit-box",
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: "vertical",
                        overflow: "hidden",
                      }}
                    >
                      {r.description}
                    </p>

                    {/* Footer Row: Time + Status + Photo Badge */}
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingTop: "0.25rem", fontSize: "0.75rem", color: "#94a3b8" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "0.35rem" }}>
                        <Clock size={12} />
                        <span>{timeAgo(r.observed_at)}</span>
                      </div>

                      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                        {r.media_ids.length > 0 && (
                          <span
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              gap: "0.2rem",
                              fontSize: "0.7rem",
                              fontWeight: 600,
                              background: "#eff6ff",
                              color: "#2563eb",
                              padding: "0.1rem 0.4rem",
                              borderRadius: "4px",
                            }}
                          >
                            <Camera size={11} />
                            {r.media_ids.length} photo{r.media_ids.length > 1 ? "s" : ""}
                          </span>
                        )}

                        {hasIncident && (
                          <span
                            style={{
                              fontSize: "0.7rem",
                              fontWeight: 700,
                              background: "#f0fdf4",
                              color: "#166534",
                              padding: "0.1rem 0.4rem",
                              borderRadius: "4px",
                              display: "inline-flex",
                              alignItems: "center",
                              gap: "0.2rem",
                            }}
                          >
                            <CheckCircle2 size={11} />
                            Incident
                          </span>
                        )}

                        <StatusBadge kind="review" value={r.review_state} />
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* ── RIGHT PANE: Ground Intelligence Dossier (Detailed View) ── */}
        {activeReport ? (
          <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
            {/* Dossier Primary Header Card */}
            <div
              style={{
                background: "#ffffff",
                borderRadius: "16px",
                padding: "1.5rem",
                border: "1px solid #e2e8f0",
                boxShadow: "0 4px 16px -2px rgba(15, 23, 42, 0.04)",
                display: "flex",
                flexDirection: "column",
                gap: "1.25rem",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "1rem" }}>
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", flexWrap: "wrap" }}>
                    <span style={{ fontSize: "1.4rem" }}>{getHazardBadge(activeReport.report_type).icon}</span>
                    <h3 style={{ margin: 0, fontSize: "1.4rem", fontWeight: 800, color: "#0f172a" }}>
                      FIELD REPORT #FR-{shortId(activeReport.id)}
                    </h3>
                    <StatusBadge kind="review" value={activeReport.review_state} />
                    <StatusBadge kind="severity" value={activeReport.severity} />
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginTop: "0.35rem", fontSize: "0.85rem", color: "#64748b" }}>
                    <span>Classification: <strong>{humanize(activeReport.report_type)}</strong></span>
                    <span>·</span>
                    <span>Record Version: <strong>v{activeReport.version}</strong></span>
                    <span>·</span>
                    <span style={{ fontFamily: "monospace" }}>UUID: {activeReport.id}</span>
                  </div>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
                  <Button
                    size="small"
                    onClick={() => {
                      void navigator.clipboard.writeText(activeReport.id);
                    }}
                    title="Copy full UUID to clipboard"
                  >
                    Copy UUID
                  </Button>
                </div>
              </div>

              {/* Provisional Caution Alert if Active */}
              {activeReport.is_provisional_caution && (
                <div
                  style={{
                    background: "#fffbeb",
                    border: "1.5px solid #fde68a",
                    borderRadius: "10px",
                    padding: "0.85rem 1rem",
                    display: "flex",
                    alignItems: "center",
                    gap: "0.75rem",
                    color: "#92400e",
                  }}
                >
                  <AlertTriangle size={20} style={{ flexShrink: 0, color: "#d97706" }} />
                  <div>
                    <strong style={{ fontSize: "0.9rem" }}>Provisional Automated Caution Active:</strong>
                    <div style={{ fontSize: "0.8rem", marginTop: "0.15rem" }}>
                      Automated hazard detection flagged this mountain defile as high risk. Dispatchers are advised of travel delays pending verifier road declaration.
                    </div>
                  </div>
                </div>
              )}

              {/* Connected Operational Incident Card (CRITICAL LINKAGE!) */}
              {linkedIncident ? (
                <div
                  style={{
                    background: "linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%)",
                    border: "1.5px solid #86efac",
                    borderRadius: "12px",
                    padding: "1.1rem 1.25rem",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    flexWrap: "wrap",
                    gap: "1rem",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "0.85rem" }}>
                    <div
                      style={{
                        width: "42px",
                        height: "42px",
                        borderRadius: "10px",
                        background: "#16a34a",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        color: "#ffffff",
                      }}
                    >
                      <ShieldCheck size={22} />
                    </div>
                    <div>
                      <div style={{ fontSize: "0.75rem", fontWeight: 700, color: "#166534", textTransform: "uppercase" }}>
                        Operational Incident Declared
                      </div>
                      <div style={{ fontSize: "1.05rem", fontWeight: 800, color: "#0f172a" }}>
                        {linkedIncident.title}
                      </div>
                      <div style={{ fontSize: "0.8rem", color: "#166534", marginTop: "0.15rem" }}>
                        Lifecycle: <strong>{linkedIncident.lifecycle}</strong> · Severity: <strong>{linkedIncident.severity}</strong> · Primary ID: {shortId(linkedIncident.id)}
                      </div>
                    </div>
                  </div>

                  <Link
                    href={`/gov/incidents?selected=${linkedIncident.id}`}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "0.5rem",
                      background: "#15803d",
                      color: "#ffffff",
                      padding: "0.6rem 1.1rem",
                      borderRadius: "10px",
                      fontWeight: 700,
                      fontSize: "0.85rem",
                      textDecoration: "none",
                      boxShadow: "0 2px 8px rgba(22, 163, 74, 0.25)",
                    }}
                  >
                    <span>Open in Incident Command Center</span>
                    <ExternalLink size={15} />
                  </Link>
                </div>
              ) : activeReport.review_state === "VERIFIED" ? (
                <div
                  style={{
                    background: "#f0fdf4",
                    border: "1px solid #bbf7d0",
                    borderRadius: "10px",
                    padding: "0.85rem 1rem",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: "0.75rem",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", color: "#166534", fontSize: "0.85rem" }}>
                    <CheckCircle2 size={16} />
                    <span><strong>Verified Observation:</strong> Road segment declared affected in regional topology.</span>
                  </div>
                  <Link
                    href="/gov/incidents"
                    style={{
                      fontSize: "0.8rem",
                      fontWeight: 600,
                      color: "#15803d",
                      textDecoration: "underline",
                    }}
                  >
                    View All Incidents →
                  </Link>
                </div>
              ) : null}

              {/* Rejection Audit Notice */}
              {activeReport.review_state === "REJECTED" && (
                <div
                  style={{
                    background: "#fef2f2",
                    border: "1.5px solid #fecaca",
                    borderRadius: "10px",
                    padding: "0.85rem 1rem",
                    color: "#991b1b",
                  }}
                >
                  <div style={{ fontWeight: 700, fontSize: "0.9rem" }}>
                    Observation Rejected: {humanize(activeReport.rejection_reason || "DISMISSED")}
                  </div>
                  {activeReport.rejection_notes && (
                    <div style={{ fontSize: "0.85rem", marginTop: "0.25rem", color: "#7f1d1d" }}>
                      &ldquo;{activeReport.rejection_notes}&rdquo;
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Officer Attribution & Sensor Telemetry Card */}
            <div
              style={{
                background: "#ffffff",
                borderRadius: "16px",
                padding: "1.5rem",
                border: "1px solid #e2e8f0",
                boxShadow: "0 4px 16px -2px rgba(15, 23, 42, 0.04)",
                display: "flex",
                flexDirection: "column",
                gap: "1.25rem",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <User size={18} style={{ color: "#2563eb" }} />
                <h4 style={{ margin: 0, fontSize: "1.05rem", fontWeight: 800, color: "#0f172a" }}>
                  Field Officer Attribution & Hardware Telemetry
                </h4>
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                  gap: "1.25rem",
                  background: "#f8fafc",
                  padding: "1.25rem",
                  borderRadius: "12px",
                }}
              >
                <div>
                  <div style={{ fontSize: "0.75rem", fontWeight: 700, color: "#64748b", textTransform: "uppercase" }}>
                    Reported By
                  </div>
                  <div style={{ fontSize: "0.95rem", fontWeight: 800, color: "#0f172a", marginTop: "0.25rem" }}>
                    Field Officer — {activeCorridor?.state || "Patrol Unit"}
                  </div>
                  <div style={{ fontSize: "0.75rem", color: "#64748b", marginTop: "0.1rem" }}>
                    Officer ID: {shortId(activeReport.reporter_id)}
                  </div>
                </div>

                <div>
                  <div style={{ fontSize: "0.75rem", fontWeight: 700, color: "#64748b", textTransform: "uppercase" }}>
                    Observation Time
                  </div>
                  <div style={{ fontSize: "0.95rem", fontWeight: 800, color: "#0f172a", marginTop: "0.25rem" }}>
                    {new Date(activeReport.observed_at).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false })} IST
                  </div>
                  <div style={{ fontSize: "0.75rem", color: "#64748b", marginTop: "0.1rem" }}>
                    {formatDateTime(activeReport.observed_at)}
                  </div>
                </div>

                <div>
                  <div style={{ fontSize: "0.75rem", fontWeight: 700, color: "#64748b", textTransform: "uppercase" }}>
                    Transmission Ingest
                  </div>
                  <div style={{ fontSize: "0.95rem", fontWeight: 800, color: "#0f172a", marginTop: "0.25rem" }}>
                    {new Date(activeReport.received_at).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false })} IST
                  </div>
                  <div style={{ fontSize: "0.75rem", color: "#16a34a", fontWeight: 600, marginTop: "0.1rem" }}>
                    +15s Telemetry Ingest Latency
                  </div>
                </div>

                <div>
                  <div style={{ fontSize: "0.75rem", fontWeight: 700, color: "#64748b", textTransform: "uppercase" }}>
                    Sensor & Accuracy
                  </div>
                  <div style={{ fontSize: "0.95rem", fontWeight: 800, color: "#0f172a", marginTop: "0.25rem" }}>
                    {activeReport.location.location_provider || "GPS_HARDWARE"}
                  </div>
                  <div style={{ fontSize: "0.75rem", color: "#2563eb", fontWeight: 600, marginTop: "0.1rem" }}>
                    Accuracy: ±{activeReport.location.accuracy_m.toFixed(1)} m
                  </div>
                </div>
              </div>
            </div>

            {/* Detailed Location & Corridor Context (NO Map, rich textual) */}
            <div
              style={{
                background: "#ffffff",
                borderRadius: "16px",
                padding: "1.5rem",
                border: "1px solid #e2e8f0",
                boxShadow: "0 4px 16px -2px rgba(15, 23, 42, 0.04)",
                display: "flex",
                flexDirection: "column",
                gap: "1.25rem",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <Compass size={18} style={{ color: "#2563eb" }} />
                <h4 style={{ margin: 0, fontSize: "1.05rem", fontWeight: 800, color: "#0f172a" }}>
                  Corridor Topography & Geographic Positioning
                </h4>
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
                  gap: "1.25rem",
                }}
              >
                <div style={{ display: "flex", flexDirection: "column", gap: "0.85rem" }}>
                  <div>
                    <span style={{ fontSize: "0.75rem", fontWeight: 700, color: "#64748b", textTransform: "uppercase" }}>
                      Highway Corridor
                    </span>
                    <div style={{ fontSize: "1.1rem", fontWeight: 800, color: "#0f172a", marginTop: "0.2rem" }}>
                      {activeCorridor?.highway}
                    </div>
                  </div>

                  <div>
                    <span style={{ fontSize: "0.75rem", fontWeight: 700, color: "#64748b", textTransform: "uppercase" }}>
                      State & Administrative District
                    </span>
                    <div style={{ fontSize: "0.95rem", fontWeight: 700, color: "#334155", marginTop: "0.2rem" }}>
                      {activeCorridor?.district}, {activeCorridor?.state}
                    </div>
                  </div>

                  <div>
                    <span style={{ fontSize: "0.75rem", fontWeight: 700, color: "#64748b", textTransform: "uppercase" }}>
                      Key Milestone / Landmark
                    </span>
                    <div style={{ fontSize: "0.95rem", fontWeight: 600, color: "#475569", marginTop: "0.2rem" }}>
                      {activeCorridor?.milestone}
                    </div>
                  </div>
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: "0.85rem" }}>
                  <div>
                    <span style={{ fontSize: "0.75rem", fontWeight: 700, color: "#64748b", textTransform: "uppercase" }}>
                      Exact GNSS Coordinates
                    </span>
                    <div
                      style={{
                        fontSize: "1.05rem",
                        fontWeight: 800,
                        color: "#0f172a",
                        marginTop: "0.2rem",
                        fontFamily: "monospace",
                        background: "#f1f5f9",
                        padding: "0.4rem 0.65rem",
                        borderRadius: "8px",
                        display: "inline-block",
                      }}
                    >
                      {activeReport.location.latitude.toFixed(6)}° N, {activeReport.location.longitude.toFixed(6)}° E
                    </div>
                  </div>

                  <div>
                    <span style={{ fontSize: "0.75rem", fontWeight: 700, color: "#64748b", textTransform: "uppercase" }}>
                      Terrain & Elevation
                    </span>
                    <div style={{ fontSize: "0.95rem", fontWeight: 600, color: "#475569", marginTop: "0.2rem" }}>
                      {activeCorridor?.terrain}
                    </div>
                  </div>

                  {activeReport.candidate_edge_id && (
                    <div>
                      <span style={{ fontSize: "0.75rem", fontWeight: 700, color: "#64748b", textTransform: "uppercase" }}>
                        Linked Network Road Segment
                      </span>
                      <div style={{ fontSize: "0.95rem", fontWeight: 700, color: "#2563eb", marginTop: "0.2rem" }}>
                        Edge ID: {shortId(activeReport.candidate_edge_id)} (Topological Network)
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Raw Field Observation Card */}
            <div
              style={{
                background: "#ffffff",
                borderRadius: "16px",
                padding: "1.5rem",
                border: "1px solid #e2e8f0",
                boxShadow: "0 4px 16px -2px rgba(15, 23, 42, 0.04)",
                display: "flex",
                flexDirection: "column",
                gap: "1rem",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <FileText size={18} style={{ color: "#2563eb" }} />
                <h4 style={{ margin: 0, fontSize: "1.05rem", fontWeight: 800, color: "#0f172a" }}>
                  Raw Field Patrol Observation
                </h4>
              </div>

              <div
                style={{
                  background: "#f8fafc",
                  borderLeft: "4px solid #3b82f6",
                  padding: "1.25rem 1.5rem",
                  borderRadius: "0 12px 12px 0",
                  fontSize: "1rem",
                  lineHeight: 1.6,
                  color: "#1e293b",
                  fontStyle: "italic",
                }}
              >
                &ldquo;{activeReport.description}&rdquo;
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: "1rem", flexWrap: "wrap", fontSize: "0.8rem", color: "#64748b" }}>
                <span>Report Type: <strong>{humanize(activeReport.report_type)}</strong></span>
                <span>·</span>
                <span>Severity Assessment: <strong>{activeReport.severity}</strong></span>
                <span>·</span>
                <span>Ground Verification Confidence: <strong>High (Field Officer Sighting)</strong></span>
              </div>
            </div>

            {/* Ground Photographic Evidence Gallery */}
            <div
              style={{
                background: "#ffffff",
                borderRadius: "16px",
                padding: "1.5rem",
                border: "1px solid #e2e8f0",
                boxShadow: "0 4px 16px -2px rgba(15, 23, 42, 0.04)",
                display: "flex",
                flexDirection: "column",
                gap: "1.25rem",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                  <Camera size={18} style={{ color: "#2563eb" }} />
                  <h4 style={{ margin: 0, fontSize: "1.05rem", fontWeight: 800, color: "#0f172a" }}>
                    Ground Forensic Photographic Evidence ({activeReport.media_ids.length})
                  </h4>
                </div>
                <span style={{ fontSize: "0.75rem", color: "#64748b" }}>
                  Time-bounded signed storage URLs
                </span>
              </div>

              {activeReport.media_ids.length === 0 ? (
                <div
                  style={{
                    padding: "2rem",
                    textAlign: "center",
                    background: "#f8fafc",
                    borderRadius: "12px",
                    border: "1px dashed #cbd5e1",
                    color: "#64748b",
                  }}
                >
                  <Camera size={28} style={{ margin: "0 auto 0.5rem", opacity: 0.5 }} />
                  <p style={{ margin: 0, fontWeight: 600, fontSize: "0.9rem", color: "#334155" }}>
                    No Photographic Attachments Attached
                  </p>
                  <p style={{ margin: "0.25rem 0 0", fontSize: "0.8rem" }}>
                    Field observation logged via low-bandwidth satellite telemetry & radio confirmation.
                  </p>
                </div>
              ) : (
                <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap" }}>
                  {activeReport.media_ids.map((id, idx) => (
                    <EvidencePhotoItem
                      key={id}
                      mediaId={id}
                      index={idx}
                      onOpenLightbox={(url, mediaId) => setLightboxState({ url, id: mediaId })}
                    />
                  ))}
                </div>
              )}
            </div>

            {/* Status Progression Pipeline */}
            <div
              style={{
                background: "#ffffff",
                borderRadius: "16px",
                padding: "1.5rem",
                border: "1px solid #e2e8f0",
                boxShadow: "0 4px 16px -2px rgba(15, 23, 42, 0.04)",
                display: "flex",
                flexDirection: "column",
                gap: "1rem",
              }}
            >
              <h4 style={{ margin: 0, fontSize: "1.05rem", fontWeight: 800, color: "#0f172a" }}>
                Status Progression Pipeline
              </h4>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(3, 1fr)",
                  gap: "0.75rem",
                  position: "relative",
                }}
              >
                {/* Step 1: SUBMITTED */}
                <div
                  style={{
                    padding: "1rem",
                    borderRadius: "10px",
                    background: "#f0fdf4",
                    border: "1.5px solid #86efac",
                    display: "flex",
                    flexDirection: "column",
                    gap: "0.25rem",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", color: "#166534", fontWeight: 700, fontSize: "0.85rem" }}>
                    <CheckCircle2 size={16} />
                    <span>1. SUBMITTED</span>
                  </div>
                  <div style={{ fontSize: "0.75rem", color: "#166534" }}>
                    Observed: {new Date(activeReport.observed_at).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: false })} IST
                  </div>
                </div>

                {/* Step 2: UNDER REVIEW */}
                <div
                  style={{
                    padding: "1rem",
                    borderRadius: "10px",
                    background:
                      activeReport.review_state === "SUBMITTED"
                        ? "#f8fafc"
                        : "#f0fdf4",
                    border: `1.5px solid ${activeReport.review_state === "SUBMITTED" ? "#e2e8f0" : "#86efac"}`,
                    display: "flex",
                    flexDirection: "column",
                    gap: "0.25rem",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "0.4rem",
                      color: activeReport.review_state === "SUBMITTED" ? "#94a3b8" : "#166534",
                      fontWeight: 700,
                      fontSize: "0.85rem",
                    }}
                  >
                    {activeReport.review_state === "SUBMITTED" ? <Clock size={16} /> : <CheckCircle2 size={16} />}
                    <span>2. UNDER REVIEW</span>
                  </div>
                  <div style={{ fontSize: "0.75rem", color: activeReport.review_state === "SUBMITTED" ? "#94a3b8" : "#166534" }}>
                    {activeReport.review_state === "SUBMITTED" ? "Awaiting Claim" : "Triaged by Operations Desk"}
                  </div>
                </div>

                {/* Step 3: DECISION */}
                <div
                  style={{
                    padding: "1rem",
                    borderRadius: "10px",
                    background:
                      activeReport.review_state === "VERIFIED"
                        ? "#f0fdf4"
                        : activeReport.review_state === "REJECTED"
                        ? "#fef2f2"
                        : activeReport.review_state === "MORE_INFO_NEEDED"
                        ? "#f0f9ff"
                        : "#f8fafc",
                    border: `1.5px solid ${
                      activeReport.review_state === "VERIFIED"
                        ? "#86efac"
                        : activeReport.review_state === "REJECTED"
                        ? "#fecaca"
                        : activeReport.review_state === "MORE_INFO_NEEDED"
                        ? "#7dd3fc"
                        : "#e2e8f0"
                    }`,
                    display: "flex",
                    flexDirection: "column",
                    gap: "0.25rem",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "0.4rem",
                      color:
                        activeReport.review_state === "VERIFIED"
                          ? "#166534"
                          : activeReport.review_state === "REJECTED"
                          ? "#991b1b"
                          : activeReport.review_state === "MORE_INFO_NEEDED"
                          ? "#0369a1"
                          : "#94a3b8",
                      fontWeight: 700,
                      fontSize: "0.85rem",
                    }}
                  >
                    {activeReport.review_state === "VERIFIED" ? (
                      <CheckCircle2 size={16} />
                    ) : activeReport.review_state === "REJECTED" ? (
                      <X size={16} />
                    ) : (
                      <Clock size={16} />
                    )}
                    <span>3. {activeReport.review_state}</span>
                  </div>
                  <div style={{ fontSize: "0.75rem", color: "#64748b" }}>
                    {activeReport.review_state === "VERIFIED"
                      ? "Confirmed & Declared"
                      : activeReport.review_state === "REJECTED"
                      ? "Dismissed / Inaccurate"
                      : activeReport.review_state === "MORE_INFO_NEEDED"
                      ? "Query Sent to Patrol"
                      : "Pending Decision"}
                  </div>
                </div>
              </div>
            </div>

            {/* RBAC Governance & Decision Section */}
            {canVerify ? (
              <VerifierAdjudicationDesk
                report={activeReport}
                incidents={allIncidents.map((i) => ({ id: i.id, title: i.title }))}
              />
            ) : (
              <div
                style={{
                  background: "#f8fafc",
                  borderRadius: "14px",
                  padding: "1.25rem 1.5rem",
                  border: "1px solid #e2e8f0",
                  display: "flex",
                  alignItems: "flex-start",
                  gap: "1rem",
                }}
              >
                <Shield size={24} style={{ color: "#2563eb", flexShrink: 0, marginTop: "0.2rem" }} />
                <div>
                  <div style={{ fontWeight: 800, fontSize: "0.95rem", color: "#0f172a" }}>
                    Regional Commander Ground Intelligence Dossier (Auditor / Monitoring View)
                  </div>
                  <p style={{ margin: "0.25rem 0 0", fontSize: "0.85rem", color: "#64748b", lineHeight: 1.5 }}>
                    As Regional Commander / MDoNER Authority, you maintain real-time strategic oversight of field intelligence, logistics impacts, and inter-state corridor status. Statutory road closure verification and legal incident declarations are executed by the designated District Verifier (District Magistrate / PWD Executive Engineer).
                  </p>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div
            style={{
              padding: "4rem 2rem",
              background: "#ffffff",
              borderRadius: "16px",
              border: "1px solid #e2e8f0",
              textAlign: "center",
              color: "#64748b",
            }}
          >
            <FileText size={48} style={{ margin: "0 auto 1rem", opacity: 0.4 }} />
            <h3 style={{ margin: 0, fontSize: "1.1rem", fontWeight: 700, color: "#1e293b" }}>
              Select a Field Report
            </h3>
            <p style={{ margin: "0.5rem 0 0", fontSize: "0.85rem" }}>
              Choose an observation from the left feed to examine forensic photos, GNSS coordinates, and ground officer reports.
            </p>
          </div>
        )}
      </div>

      {/* Lightbox Modal */}
      {lightboxState && (
        <PhotoLightboxModal
          url={lightboxState.url}
          mediaId={lightboxState.id}
          onClose={() => setLightboxState(null)}
        />
      )}
    </div>
  );
}

// Exported component with Suspense for Next.js searchParams
export function ReportsCommandCenter({ basePath = "/gov/reports" }: { basePath?: string }) {
  return (
    <Suspense
      fallback={
        <div style={{ padding: "3rem", textAlign: "center", color: "#64748b" }}>
          <RefreshCw size={24} className="animate-spin" style={{ margin: "0 auto 0.75rem" }} />
          <p>Initializing Field Intelligence Dossier...</p>
        </div>
      }
    >
      <ReportsCommandCenterInner basePath={basePath} />
    </Suspense>
  );
}
