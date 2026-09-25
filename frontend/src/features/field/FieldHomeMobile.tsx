"use client";

import Link from "next/link";
import { useState } from "react";
import {
  AlertTriangle,
  Camera,
  ChevronRight,
  HardDrive,
  MapPin,
  Navigation,
  PhoneCall,
  RefreshCw,
  Satellite,
  Shield,
  Wifi,
  WifiOff,
  X,
} from "lucide-react";
import { CORRIDOR_MILESTONES, type CorridorMilestone } from "@/shared/lib/corridors";
import { formatCoords } from "@/shared/lib/format";
import { formatDistance } from "@/shared/lib/geo";
import { useFieldHomeData } from "./useFieldHomeData";

/** Control-room hotline is deployment config; the button is hidden rather than wired to a guessed number. */
const SOS_NUMBER = process.env.NEXT_PUBLIC_FIELD_SOS_NUMBER?.trim().replace(/[^\d+]/g, "") || null;

export function FieldHomeMobile() {
  const {
    scope,
    geo,
    snap,
    isOnline,
    syncing,
    lastSyncAt,
    syncNow,
    pendingCount,
    needsAttentionCount,
    myReportsCount,
    nearbyAlertsCount,
    corridorHealth,
    latestReport,
    activeDraft,
    sensorHealth,
    weatherNotice,
  } = useFieldHomeData();

  const [showMilestonePicker, setShowMilestonePicker] = useState(false);
  const [manualMilestone, setManualMilestone] = useState<CorridorMilestone | null>(null);

  const fix = geo.state.status === "ok" ? geo.state.fix : null;
  const activeChainage = manualMilestone
    ? `${manualMilestone.corridor} · KM ${manualMilestone.chainageKm.toFixed(1)}`
    : snap
    ? snap.formattedChainage
    : "Corridor Locating…";

  const activeLandmark = manualMilestone
    ? manualMilestone.name
    : snap
    ? snap.nearestMilestone
    : "Acquiring GNSS Satellite Fix…";

  const isOffCorridor = !manualMilestone && snap && !snap.isWithinCorridor;

  return (
    <div className="field-ops-wrap" style={{ padding: "0.5rem 0.5rem 2.5rem" }}>
      {/* ── 1. Top Bar & Status Strip (Full Width on all screens) ── */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          background: "#ffffff",
          borderRadius: "14px",
          padding: "0.65rem 1rem",
          border: "1.5px solid #e2e8f0",
          boxShadow: "0 2px 8px -2px rgba(15, 23, 42, 0.05)",
          flexWrap: "wrap",
          gap: "0.6rem",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "0.55rem" }}>
          <div
            style={{
              width: "32px",
              height: "32px",
              borderRadius: "9px",
              background: "linear-gradient(135deg, #0284c7 0%, #0369a1 100%)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#ffffff",
            }}
          >
            <Shield size={18} />
          </div>
          <div>
            <div style={{ fontSize: "0.92rem", fontWeight: 800, color: "#0f172a", letterSpacing: "0.02em" }}>
              PARVA <span style={{ fontSize: "0.74rem", color: "#0284c7", fontWeight: 700 }}>FIELD OPS</span>
            </div>
            <div style={{ fontSize: "0.7rem", color: "#64748b" }}>Tactical Ground Patrol Command Desk</div>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
          {/* Online / Offline Pill */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.35rem",
              padding: "0.3rem 0.7rem",
              borderRadius: "20px",
              fontSize: "0.76rem",
              fontWeight: 700,
              background: isOnline ? "#f0fdf4" : "#fffbeb",
              color: isOnline ? "#15803d" : "#b45309",
              border: `1px solid ${isOnline ? "#bbf7d0" : "#fde68a"}`,
            }}
          >
            {isOnline ? <Wifi size={13} color="#16a34a" /> : <WifiOff size={13} color="#d97706" />}
            <span>{isOnline ? "Online · Live Sync" : "Offline · Queue Active"}</span>
          </div>

          {/* Sync Button */}
          <button
            type="button"
            onClick={() => void syncNow()}
            disabled={syncing || !isOnline}
            title={lastSyncAt ? `Last synced ${lastSyncAt.toLocaleTimeString()}` : "Sync with central servers"}
            style={{
              border: "1px solid #cbd5e1",
              background: "#f8fafc",
              borderRadius: "8px",
              padding: "0.35rem 0.7rem",
              cursor: isOnline && !syncing ? "pointer" : "default",
              display: "flex",
              alignItems: "center",
              gap: "0.3rem",
              fontSize: "0.76rem",
              fontWeight: 600,
              color: "#334155",
            }}
          >
            <RefreshCw size={13} className={syncing ? "animate-spin" : ""} color="#475569" />
            <span>{syncing ? "Syncing…" : "Sync Now"}</span>
          </button>

          {/* SOS Hotline */}
          {SOS_NUMBER ? (
          <a
            href={`tel:${SOS_NUMBER}`}
            title="Call Regional Emergency Control Room"
            style={{
              background: "#fee2e2",
              border: "1px solid #fca5a5",
              borderRadius: "8px",
              padding: "0.4rem 0.75rem",
              color: "#b91c1c",
              display: "flex",
              alignItems: "center",
              gap: "0.35rem",
              textDecoration: "none",
              fontSize: "0.76rem",
              fontWeight: 700,
            }}
          >
            <PhoneCall size={14} />
            <span>Control Room SOS</span>
          </a>
          ) : null}
        </div>
      </div>

      {/* ── 2. Greeting & Patrol Scope Header (Full Width) ── */}
      <div
        style={{
          background: "linear-gradient(135deg, #0f172a 0%, #1e293b 100%)",
          color: "#ffffff",
          borderRadius: "14px",
          padding: "1rem 1.25rem",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          boxShadow: "0 4px 16px -3px rgba(15, 23, 42, 0.25)",
          flexWrap: "wrap",
          gap: "0.75rem",
        }}
      >
        <div>
          <div style={{ fontSize: "0.78rem", color: "#94a3b8", fontWeight: 600, display: "flex", alignItems: "center", gap: "0.35rem" }}>
            <span>{scope.greetingIcon}</span>
            <span>{scope.greeting}</span>
          </div>
          <div style={{ fontSize: "1.25rem", fontWeight: 900, marginTop: "0.15rem", letterSpacing: "-0.01em" }}>
            {scope.officerName}
          </div>
          <div style={{ fontSize: "0.78rem", color: "#38bdf8", fontWeight: 700, marginTop: "0.25rem" }}>
            {scope.patrolSector}{scope.unitCode ? <> · <span style={{ color: "#cbd5e1", fontWeight: 500 }}>{scope.unitCode}</span></> : null}
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <span
            style={{
              fontSize: "0.72rem",
              background: "rgba(56, 189, 248, 0.15)",
              color: "#38bdf8",
              border: "1px solid rgba(56, 189, 248, 0.35)",
              padding: "0.3rem 0.65rem",
              borderRadius: "6px",
              fontWeight: 800,
              textTransform: "uppercase",
              letterSpacing: "0.04em",
            }}
          >
            Ground Patrol Active
          </span>
        </div>
      </div>

      {/* ── 3. Sensor & Storage Pre-Flight Check Strip ── */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
          gap: "0.55rem",
          background: "#f8fafc",
          padding: "0.55rem 0.85rem",
          borderRadius: "10px",
          border: "1px solid #e2e8f0",
          fontSize: "0.74rem",
          fontWeight: 600,
          color: "#475569",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "0.3rem" }}>
          <Satellite size={14} color={sensorHealth.gpsStatus === "LOCKED" ? "#16a34a" : "#d97706"} />
          <span>
            {sensorHealth.gpsStatus === "LOCKED"
              ? `GPS ±${sensorHealth.gpsAccuracyM}m Fix`
              : sensorHealth.gpsStatus === "SEARCHING"
              ? "GPS Searching…"
              : "GPS Standby"}
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "0.3rem" }}>
          <Camera size={14} color="#0284c7" />
          <span>Camera Sensor Ready</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "0.3rem" }}>
          <HardDrive size={14} color="#64748b" />
          <span>Offline DB: {sensorHealth.storageFreePct === null ? "storage size unknown" : `${sensorHealth.storageFreePct}% storage free`}</span>
        </div>
      </div>

      {/* ── 4. RESPONSIVE TWO-COLUMN COMMAND DESK (Web & Mobile Split) ── */}
      <div className="field-ops-split">
        {/* ── LEFT COLUMN: Primary Ground Patrol & Actions Desk ── */}
        <div style={{ display: "flex", flexDirection: "column", gap: "0.9rem" }}>
          {/* Location Hero Card */}
          <div
            style={{
              background: "#ffffff",
              borderRadius: "14px",
              padding: "1.1rem",
              border: isOffCorridor ? "1.5px solid #f59e0b" : "1.5px solid #cbd5e1",
              boxShadow: "0 2px 12px -2px rgba(15, 23, 42, 0.06)",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <div
                  style={{
                    width: "34px",
                    height: "34px",
                    borderRadius: "50%",
                    background: "#f0fdf4",
                    border: "1.5px solid #86efac",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "#16a34a",
                  }}
                >
                  <MapPin size={18} />
                </div>
                <div>
                  <span style={{ fontSize: "0.72rem", color: "#64748b", fontWeight: 700, textTransform: "uppercase" }}>
                    Current Highway Chainage
                  </span>
                  <div style={{ fontSize: "1.4rem", fontWeight: 900, color: "#0f172a", lineHeight: 1.15 }}>
                    {activeChainage}
                  </div>
                </div>
              </div>

              {/* GPS Accuracy Chip */}
              <div style={{ textAlign: "right" }}>
                {fix ? (
                  <span
                    style={{
                      display: "inline-block",
                      padding: "0.25rem 0.55rem",
                      borderRadius: "6px",
                      fontSize: "0.7rem",
                      fontWeight: 700,
                      background: fix.accuracy_m <= 10 ? "#dcfce7" : fix.accuracy_m <= 50 ? "#fef3c7" : "#fee2e2",
                      color: fix.accuracy_m <= 10 ? "#15803d" : fix.accuracy_m <= 50 ? "#b45309" : "#b91c1c",
                      border: `1px solid ${fix.accuracy_m <= 10 ? "#86efac" : fix.accuracy_m <= 50 ? "#fcd34d" : "#fca5a5"}`,
                    }}
                  >
                    ±{Math.round(fix.accuracy_m)}m Accuracy
                  </span>
                ) : (
                  <span style={{ fontSize: "0.7rem", color: "#94a3b8", fontWeight: 600 }}>No GPS fix</span>
                )}
              </div>
            </div>

            {/* Landmark Subtitle */}
            <div style={{ marginTop: "0.55rem", fontSize: "0.9rem", fontWeight: 700, color: "#1e293b" }}>
              {activeLandmark}
            </div>

            {/* Raw Coordinates & Age */}
            {fix && (
              <div style={{ fontSize: "0.74rem", color: "#64748b", marginTop: "0.2rem" }}>
                {formatCoords(fix.latitude, fix.longitude)}
                {fix.altitude_m != null && ` · Altitude ${Math.round(fix.altitude_m)}m`}
              </div>
            )}

            {/* Off-Corridor Warning Banner */}
            {isOffCorridor && (
              <div
                style={{
                  marginTop: "0.7rem",
                  padding: "0.55rem 0.75rem",
                  borderRadius: "8px",
                  background: "#fffbeb",
                  border: "1px solid #fde68a",
                  display: "flex",
                  alignItems: "center",
                  gap: "0.45rem",
                  fontSize: "0.76rem",
                  color: "#92400e",
                }}
              >
                <AlertTriangle size={15} color="#d97706" />
                <span>
                  <strong>Off-Corridor Warning:</strong> Position is {formatDistance(snap?.offCorridorM)} from the NH-27/NH-6 highway centerline.
                </span>
              </div>
            )}

            {/* Location Actions: Refresh + Mountain Canyon Milestone Fallback */}
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginTop: "0.85rem",
                paddingTop: "0.75rem",
                borderTop: "1px solid #f1f5f9",
                flexWrap: "wrap",
                gap: "0.5rem",
              }}
            >
              <button
                type="button"
                onClick={geo.locate}
                disabled={geo.state.status === "locating"}
                style={{
                  background: "#f8fafc",
                  border: "1px solid #cbd5e1",
                  borderRadius: "7px",
                  padding: "0.4rem 0.75rem",
                  fontSize: "0.76rem",
                  fontWeight: 700,
                  color: "#0f172a",
                  cursor: "pointer",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "0.35rem",
                }}
              >
                <RefreshCw size={13} className={geo.state.status === "locating" ? "animate-spin" : ""} />
                <span>{geo.state.status === "locating" ? "Locating Fix…" : "Update GPS Fix"}</span>
              </button>

              <button
                type="button"
                onClick={() => setShowMilestonePicker(true)}
                style={{
                  background: "#eff6ff",
                  border: "1px solid #bfdbfe",
                  borderRadius: "7px",
                  padding: "0.4rem 0.75rem",
                  fontSize: "0.76rem",
                  fontWeight: 700,
                  color: "#0284c7",
                  cursor: "pointer",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "0.3rem",
                }}
              >
                <Navigation size={13} />
                <span>{manualMilestone ? "Change Milestone" : "Milestone Fallback Picker"}</span>
              </button>
            </div>
          </div>

          {/* Dynamic Weather & Monsoon Hazard Caution */}
          {weatherNotice && (
            <div
              style={{
                background: "#eff6ff",
                border: "1px solid #bfdbfe",
                borderRadius: "10px",
                padding: "0.65rem 0.9rem",
                display: "flex",
                alignItems: "center",
                gap: "0.5rem",
                fontSize: "0.78rem",
                color: "#1e40af",
                fontWeight: 600,
              }}
            >
              <span style={{ fontSize: "1.15rem" }}>🌧️</span>
              <span>{weatherNotice}</span>
            </div>
          )}

          {/* Attention & Resume Draft Banners */}
          {activeDraft && (
            <Link
              href={`/field/report/new`}
              style={{
                background: "linear-gradient(90deg, #fffbeb 0%, #fef3c7 100%)",
                border: "1.5px solid #fcd34d",
                borderRadius: "10px",
                padding: "0.75rem 0.95rem",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                textDecoration: "none",
                boxShadow: "0 2px 8px rgba(245, 158, 11, 0.12)",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <span style={{ fontSize: "1.2rem" }}>📝</span>
                <div>
                  <div style={{ fontSize: "0.84rem", fontWeight: 800, color: "#92400e" }}>
                    Unfinished Draft: {activeDraft.type}
                  </div>
                  <div style={{ fontSize: "0.72rem", color: "#b45309" }}>
                    Step {activeDraft.step + 1} of 5 · Saved {activeDraft.timeAgo}
                  </div>
                </div>
              </div>
              <span
                style={{
                  fontSize: "0.78rem",
                  fontWeight: 800,
                  color: "#92400e",
                  display: "flex",
                  alignItems: "center",
                  gap: "0.2rem",
                }}
              >
                Resume <ChevronRight size={15} />
              </span>
            </Link>
          )}

          {needsAttentionCount > 0 && (
            <Link
              href="/field/queue"
              style={{
                background: "#fef2f2",
                border: "1.5px solid #fecaca",
                borderRadius: "10px",
                padding: "0.7rem 0.95rem",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                textDecoration: "none",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "0.45rem" }}>
                <AlertTriangle size={16} color="#b91c1c" />
                <span style={{ fontSize: "0.78rem", fontWeight: 700, color: "#991b1b" }}>
                  {needsAttentionCount} report(s) in queue need attention (retry / edit)
                </span>
              </div>
              <ChevronRight size={16} color="#b91c1c" />
            </Link>
          )}

          {/* Primary Action Buttons */}
          <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
            {/* 🚨 1. REPORT INCIDENT */}
            <Link
              href="/field/report/new"
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                background: "linear-gradient(135deg, #dc2626 0%, #b91c1c 100%)",
                color: "#ffffff",
                padding: "1rem 1.25rem",
                borderRadius: "14px",
                textDecoration: "none",
                boxShadow: "0 6px 20px -3px rgba(220, 38, 38, 0.35)",
                border: "1px solid #ef4444",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "0.85rem" }}>
                <div
                  style={{
                    width: "44px",
                    height: "44px",
                    borderRadius: "11px",
                    background: "rgba(255, 255, 255, 0.2)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: "1.45rem",
                  }}
                >
                  🚨
                </div>
                <div>
                  <div style={{ fontSize: "1.1rem", fontWeight: 900, letterSpacing: "0.02em" }}>
                    REPORT INCIDENT
                  </div>
                  <div style={{ fontSize: "0.76rem", color: "#fee2e2", fontWeight: 500 }}>
                    Capture geo-tagged photo &amp; ground severity
                  </div>
                </div>
              </div>
              <ChevronRight size={22} color="#ffffff" />
            </Link>

            {/* 🛣️ 2. ROAD CONDITION UPDATE */}
            <Link
              href="/field/road-update"
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                background: "#ffffff",
                color: "#0f172a",
                padding: "0.95rem 1.25rem",
                borderRadius: "14px",
                textDecoration: "none",
                border: "1.5px solid #cbd5e1",
                boxShadow: "0 3px 10px -2px rgba(15, 23, 42, 0.05)",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "0.85rem" }}>
                <div
                  style={{
                    width: "44px",
                    height: "44px",
                    borderRadius: "11px",
                    background: "#f1f5f9",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: "1.45rem",
                  }}
                >
                  🛣️
                </div>
                <div>
                  <div style={{ fontSize: "1.02rem", fontWeight: 800 }}>
                    ROAD CONDITION UPDATE
                  </div>
                  <div style={{ fontSize: "0.76rem", color: "#64748b", fontWeight: 500 }}>
                    Update passability on NH-27 / NH-6
                  </div>
                </div>
              </div>
              <ChevronRight size={20} color="#64748b" />
            </Link>
          </div>

          {/* Quick Hazard Shortcut Chips */}
          <div>
            <div style={{ fontSize: "0.74rem", fontWeight: 700, color: "#64748b", marginBottom: "0.4rem", textTransform: "uppercase", letterSpacing: "0.03em" }}>
              Quick Report by Hazard Type:
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.45rem" }}>
              <Link
                href="/field/report/new?type=LANDSLIDE"
                style={{
                  padding: "0.6rem 0.75rem",
                  background: "#ffffff",
                  border: "1px solid #e2e8f0",
                  borderRadius: "8px",
                  fontSize: "0.8rem",
                  fontWeight: 700,
                  color: "#334155",
                  display: "flex",
                  alignItems: "center",
                  gap: "0.4rem",
                  textDecoration: "none",
                }}
              >
                <span>⛰️</span> Landslide
              </Link>
              <Link
                href="/field/report/new?type=FLOODING"
                style={{
                  padding: "0.6rem 0.75rem",
                  background: "#ffffff",
                  border: "1px solid #e2e8f0",
                  borderRadius: "8px",
                  fontSize: "0.8rem",
                  fontWeight: 700,
                  color: "#334155",
                  display: "flex",
                  alignItems: "center",
                  gap: "0.4rem",
                  textDecoration: "none",
                }}
              >
                <span>🌊</span> Flash Flood
              </Link>
              <Link
                href="/field/report/new?type=BRIDGE_COLLAPSE"
                style={{
                  padding: "0.6rem 0.75rem",
                  background: "#ffffff",
                  border: "1px solid #e2e8f0",
                  borderRadius: "8px",
                  fontSize: "0.8rem",
                  fontWeight: 700,
                  color: "#334155",
                  display: "flex",
                  alignItems: "center",
                  gap: "0.4rem",
                  textDecoration: "none",
                }}
              >
                <span>🌉</span> Bridge Damage
              </Link>
              <Link
                href="/field/report/new?type=OBSTRUCTION"
                style={{
                  padding: "0.6rem 0.75rem",
                  background: "#ffffff",
                  border: "1px solid #e2e8f0",
                  borderRadius: "8px",
                  fontSize: "0.8rem",
                  fontWeight: 700,
                  color: "#334155",
                  display: "flex",
                  alignItems: "center",
                  gap: "0.4rem",
                  textDecoration: "none",
                }}
              >
                <span>🚧</span> Full Obstruction
              </Link>
            </div>
          </div>
        </div>

        {/* ── RIGHT COLUMN: Situational Intelligence & Operational Overview ── */}
        <div style={{ display: "flex", flexDirection: "column", gap: "0.9rem" }}>
          {/* Interactive 3 Stat Tiles */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "0.5rem" }}>
            {/* Tile 1: My Reports */}
            <Link
              href="/field/reports"
              style={{
                background: "#ffffff",
                padding: "0.85rem 0.6rem",
                borderRadius: "12px",
                border: "1px solid #e2e8f0",
                textAlign: "center",
                textDecoration: "none",
                boxShadow: "0 2px 6px rgba(15, 23, 42, 0.04)",
              }}
            >
              <div style={{ fontSize: "0.7rem", fontWeight: 700, color: "#64748b", textTransform: "uppercase" }}>
                My Reports
              </div>
              <div style={{ fontSize: "1.75rem", fontWeight: 900, color: "#0f172a", marginTop: "0.15rem" }}>
                {myReportsCount}
              </div>
              <div style={{ fontSize: "0.7rem", color: "#0284c7", fontWeight: 600 }}>History ➔</div>
            </Link>

            {/* Tile 2: Pending Sync */}
            <Link
              href="/field/queue"
              style={{
                background: pendingCount > 0 ? "#fffbeb" : "#ffffff",
                padding: "0.85rem 0.6rem",
                borderRadius: "12px",
                border: pendingCount > 0 ? "1.5px solid #fcd34d" : "1px solid #e2e8f0",
                textAlign: "center",
                textDecoration: "none",
                boxShadow: "0 2px 6px rgba(15, 23, 42, 0.04)",
              }}
            >
              <div style={{ fontSize: "0.7rem", fontWeight: 700, color: "#64748b", textTransform: "uppercase" }}>
                Pending Sync
              </div>
              <div
                style={{
                  fontSize: "1.75rem",
                  fontWeight: 900,
                  color: pendingCount > 0 ? "#d97706" : "#059669",
                  marginTop: "0.15rem",
                }}
              >
                {pendingCount}
              </div>
              <div style={{ fontSize: "0.7rem", color: pendingCount > 0 ? "#b45309" : "#16a34a", fontWeight: 600 }}>
                {pendingCount > 0 ? "In Queue ➔" : "Synced ✓"}
              </div>
            </Link>

            {/* Tile 3: Nearby Alerts */}
            <Link
              href="/field/nearby"
              style={{
                background: "#ffffff",
                padding: "0.85rem 0.6rem",
                borderRadius: "12px",
                border: "1px solid #e2e8f0",
                textAlign: "center",
                textDecoration: "none",
                boxShadow: "0 2px 6px rgba(15, 23, 42, 0.04)",
              }}
            >
              <div style={{ fontSize: "0.7rem", fontWeight: 700, color: "#64748b", textTransform: "uppercase" }}>
                Nearby Alerts
              </div>
              <div style={{ fontSize: "1.75rem", fontWeight: 900, color: "#0f172a", marginTop: "0.15rem" }}>
                {nearbyAlertsCount}
              </div>
              <div style={{ fontSize: "0.7rem", color: "#0284c7", fontWeight: 600 }}>Corridor Radar ➔</div>
            </Link>
          </div>

          {/* Live Corridor Passability Health & Progress Bar */}
          <div
            style={{
              background: "#ffffff",
              borderRadius: "14px",
              padding: "0.9rem 1.1rem",
              border: "1px solid #e2e8f0",
              boxShadow: "0 2px 8px -2px rgba(15, 23, 42, 0.04)",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
              <span style={{ fontWeight: 800, color: "#0f172a", fontSize: "0.84rem" }}>
                NH-27 / NH-6 Corridor Passability:
              </span>
              <span style={{ fontWeight: 600, color: "#64748b", fontSize: "0.74rem" }}>
                {corridorHealth.total} segments monitored
              </span>
            </div>

            {/* Visual Progress Bar */}
            <div style={{ height: "8px", borderRadius: "4px", background: "#f1f5f9", display: "flex", overflow: "hidden", marginBottom: "0.6rem" }}>
              <div style={{ width: `${corridorHealth.total ? (corridorHealth.open / corridorHealth.total) * 100 : 80}%`, background: "#16a34a" }} />
              <div style={{ width: `${corridorHealth.total ? ((corridorHealth.restricted + corridorHealth.caution) / corridorHealth.total) * 100 : 15}%`, background: "#eab308" }} />
              <div style={{ width: `${corridorHealth.total ? (corridorHealth.blocked / corridorHealth.total) * 100 : 5}%`, background: "#ef4444" }} />
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.76rem", fontWeight: 700 }}>
              <span style={{ color: "#16a34a" }}>🟢 {corridorHealth.open} Passable</span>
              <span style={{ color: "#d97706" }}>🟡 {corridorHealth.restricted + corridorHealth.caution} Restricted</span>
              <span style={{ color: "#dc2626" }}>🔴 {corridorHealth.blocked} Blocked</span>
            </div>
          </div>

          {/* Recent Report Feedback */}
          {latestReport && (
            <div
              style={{
                background: "#ffffff",
                borderRadius: "14px",
                padding: "0.9rem 1.1rem",
                border: "1px solid #e2e8f0",
                boxShadow: "0 2px 8px -2px rgba(15, 23, 42, 0.04)",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.35rem" }}>
                <span style={{ fontSize: "0.72rem", fontWeight: 700, color: "#64748b", textTransform: "uppercase" }}>
                  Latest Patrol Submission
                </span>
                <span
                  style={{
                    fontSize: "0.7rem",
                    padding: "0.15rem 0.55rem",
                    borderRadius: "4px",
                    fontWeight: 800,
                    background:
                      latestReport.status === "VERIFIED"
                        ? "#dcfce7"
                        : latestReport.status === "WAITING_TO_SYNC"
                        ? "#fffbeb"
                        : "#eff6ff",
                    color:
                      latestReport.status === "VERIFIED"
                        ? "#15803d"
                        : latestReport.status === "WAITING_TO_SYNC"
                        ? "#b45309"
                        : "#1d4ed8",
                  }}
                >
                  {latestReport.status}
                </span>
              </div>
              <div style={{ fontSize: "0.9rem", fontWeight: 800, color: "#0f172a" }}>
                {latestReport.type}: {latestReport.title}
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "0.45rem", fontSize: "0.76rem", color: "#64748b" }}>
                <span>Logged {latestReport.timeAgo}</span>
                <Link
                  href={latestReport.isLocal ? "/field/queue" : `/field/reports/${latestReport.id}`}
                  style={{ color: "#0284c7", fontWeight: 700, textDecoration: "none" }}
                >
                  View Record ➔
                </Link>
              </div>
            </div>
          )}

          {/* Corridor Lifeline Milestones Guide */}
          <div
            style={{
              background: "#ffffff",
              borderRadius: "14px",
              padding: "0.9rem 1.1rem",
              border: "1px solid #e2e8f0",
              boxShadow: "0 2px 8px -2px rgba(15, 23, 42, 0.04)",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.45rem" }}>
              <span style={{ fontWeight: 800, color: "#0f172a", fontSize: "0.84rem" }}>
                Key Corridor Lifeline Checkpoints:
              </span>
              <span style={{ fontSize: "0.7rem", color: "#0284c7", fontWeight: 700 }}>
                NH-6 &amp; NH-27
              </span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.35rem" }}>
              {CORRIDOR_MILESTONES.slice(2, 8).map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setManualMilestone(m)}
                  style={{
                    background: manualMilestone?.id === m.id ? "#eff6ff" : "#f8fafc",
                    border: manualMilestone?.id === m.id ? "1.5px solid #3b82f6" : "1px solid #f1f5f9",
                    borderRadius: "8px",
                    padding: "0.4rem 0.65rem",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    cursor: "pointer",
                    textAlign: "left",
                  }}
                >
                  <span style={{ fontSize: "0.78rem", fontWeight: 600, color: "#334155" }}>
                    {m.name}
                  </span>
                  <span style={{ fontSize: "0.72rem", fontWeight: 800, color: "#0284c7" }}>
                    KM {m.chainageKm}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── Mountain Canyon Milestone Selector Modal ── */}
      {showMilestonePicker && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(15, 23, 42, 0.65)",
            backdropFilter: "blur(4px)",
            zIndex: 9999,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "1rem",
          }}
        >
          <div
            style={{
              background: "#ffffff",
              borderRadius: "16px",
              maxWidth: "460px",
              width: "100%",
              maxHeight: "85vh",
              overflowY: "auto",
              boxShadow: "0 20px 40px -8px rgba(0, 0, 0, 0.3)",
              border: "1.5px solid #cbd5e1",
            }}
          >
            {/* Modal Header */}
            <div
              style={{
                padding: "0.95rem 1.25rem",
                borderBottom: "1px solid #e2e8f0",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <div>
                <h3 style={{ margin: 0, fontSize: "1.05rem", fontWeight: 800, color: "#0f172a" }}>
                  📍 Choose Corridor Milestone
                </h3>
                <p style={{ margin: "0.15rem 0 0", fontSize: "0.74rem", color: "#64748b" }}>
                  Use this fallback when GPS is blocked by mountain defiles
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowMilestonePicker(false)}
                style={{
                  background: "transparent",
                  border: 0,
                  cursor: "pointer",
                  color: "#64748b",
                  padding: "4px",
                }}
              >
                <X size={20} />
              </button>
            </div>

            {/* Modal List */}
            <div style={{ padding: "0.85rem", display: "flex", flexDirection: "column", gap: "0.45rem" }}>
              {CORRIDOR_MILESTONES.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => {
                    setManualMilestone(m);
                    setShowMilestonePicker(false);
                  }}
                  style={{
                    background: manualMilestone?.id === m.id ? "#eff6ff" : "#f8fafc",
                    border: manualMilestone?.id === m.id ? "1.5px solid #3b82f6" : "1px solid #e2e8f0",
                    borderRadius: "10px",
                    padding: "0.65rem 0.85rem",
                    textAlign: "left",
                    cursor: "pointer",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  <div>
                    <div style={{ fontSize: "0.86rem", fontWeight: 700, color: "#0f172a" }}>
                      {m.name}
                    </div>
                    <div style={{ fontSize: "0.72rem", color: "#64748b" }}>
                      {m.corridor} · Chainage Marker KM {m.chainageKm.toFixed(1)}
                    </div>
                  </div>
                  <span
                    style={{
                      fontSize: "0.78rem",
                      fontWeight: 800,
                      color: "#0284c7",
                      padding: "0.2rem 0.55rem",
                      background: "#e0f2fe",
                      borderRadius: "6px",
                    }}
                  >
                    KM {m.chainageKm}
                  </span>
                </button>
              ))}

              {manualMilestone && (
                <button
                  type="button"
                  onClick={() => {
                    setManualMilestone(null);
                    setShowMilestonePicker(false);
                  }}
                  style={{
                    marginTop: "0.6rem",
                    padding: "0.6rem",
                    background: "#fef2f2",
                    border: "1px solid #fca5a5",
                    color: "#b91c1c",
                    borderRadius: "8px",
                    fontSize: "0.76rem",
                    fontWeight: 700,
                    cursor: "pointer",
                  }}
                >
                  Clear Manual Milestone (Restore Live GNSS Fix)
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
