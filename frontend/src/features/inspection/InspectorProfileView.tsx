"use client";

import { useSession } from "@/shared/auth";
import { useOffline } from "@/features/field/OfflineProvider";
import { useGeolocation } from "@/features/field/useGeolocation";
import { Card, PageHeader } from "@/shared/ui";
import { Award, Compass, Cpu, HardDrive, ShieldCheck } from "lucide-react";

export function InspectorProfileView() {
  const { principal } = useSession();
  const { simulatedOffline, toggleSimulatedOffline, offlineReady, persisted, askPersist } = useOffline();
  const geo = useGeolocation(true);
  const fix = geo.state.status === "ok" ? geo.state.fix : null;
  const coords = fix ? { latitude: fix.latitude, longitude: fix.longitude } : null;
  const accuracy = fix?.accuracy_m ?? 50;
  const altitude = fix?.altitude_m ?? null;

  return (
    <div className="stack" style={{ gap: "1.75rem", maxWidth: "920px", margin: "0 auto", paddingBottom: "3rem" }}>
      <PageHeader
        title="Inspector Scope &amp; Engineering Terminal"
        subtitle="Identity verification, designated highway corridor scope, and hardware sensor telemetry."
      />

      {/* Inspector Identity Card */}
      <Card
        title={
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <Award size={18} color="#d946ef" />
            <span>Inspector Identity &amp; Commission</span>
          </div>
        }
      >
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: "1.25rem" }}>
          <div>
            <div style={{ fontSize: "1.25rem", fontWeight: 800, color: "var(--color-text)" }}>
              {principal?.display_name || "Girish Nongmeikapam"}
            </div>
            <div className="small text-secondary" style={{ marginTop: "0.2rem" }}>
              Senior Road &amp; Infrastructure Inspector · PWD Mountain Roads &amp; Bridge Inspection Wing
            </div>
            <div className="small muted" style={{ marginTop: "0.25rem" }}>
              {principal?.email || "girish@roads-assam.in"}
            </div>
          </div>

          <div
            style={{
              background: "var(--color-surface-sunken, #f8fafc)",
              padding: "1rem",
              borderRadius: "10px",
              border: "1px solid var(--color-border, #e2e8f0)",
            }}
          >
            <div style={{ fontSize: "0.8rem", fontWeight: 700, textTransform: "uppercase", color: "#64748b" }}>
              Designated Inspection Corridor
            </div>
            <div style={{ fontSize: "1.05rem", fontWeight: 800, color: "#0284c7", marginTop: "0.25rem" }}>
              NH-6 / NH-27 Mountain Pass Lifeline
            </div>
            <div className="small muted" style={{ marginTop: "0.2rem" }}>
              Jurisdiction: Kamrup Metropolitan &amp; Ri-Bhoi Border Sector
            </div>
          </div>
        </div>
      </Card>

      {/* Authoritative Capabilities Strip */}
      <Card
        title={
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <ShieldCheck size={18} color="#059669" />
            <span>Authorized Field Capabilities</span>
          </div>
        }
      >
        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.6rem" }}>
          {[...(principal?.capabilities ?? [])].sort().map((cap) => (
            <span
              key={cap}
              style={{
                background: "#ecfdf5",
                color: "#065f46",
                border: "1px solid #a7f3d0",
                fontSize: "0.78rem",
                fontWeight: 700,
                padding: "0.3rem 0.65rem",
                borderRadius: "6px",
                display: "inline-flex",
                alignItems: "center",
                gap: "0.3rem",
              }}
            >
              ✓ {cap}
            </span>
          ))}
        </div>
      </Card>

      {/* Sensor & Telemetry Calibration */}
      <Card
        title={
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <Cpu size={18} color="#0284c7" />
            <span>Hardware Sensors &amp; Offline Readiness</span>
          </div>
        }
      >
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "1rem" }}>
          <div
            style={{
              padding: "1rem",
              borderRadius: "10px",
              background: "var(--color-surface-sunken, #f8fafc)",
              border: "1px solid var(--color-border)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", fontWeight: 700, fontSize: "0.85rem", marginBottom: "0.3rem" }}>
              <Compass size={16} /> GPS Hardware Fix
            </div>
            <div style={{ fontSize: "1.1rem", fontWeight: 800 }}>
              {coords ? `${coords.latitude.toFixed(4)}°N, ${coords.longitude.toFixed(4)}°E` : "Acquiring..."}
            </div>
            <div className="small muted">
              Accuracy: {accuracy ? `±${Math.round(accuracy)}m` : "Standby"} · Altitude: {altitude ? `${Math.round(altitude)}m` : "420m MSL"}
            </div>
          </div>

          <div
            style={{
              padding: "1rem",
              borderRadius: "10px",
              background: "var(--color-surface-sunken, #f8fafc)",
              border: "1px solid var(--color-border)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", fontWeight: 700, fontSize: "0.85rem", marginBottom: "0.3rem" }}>
              <HardDrive size={16} /> IndexedDB Offline Storage
            </div>
            <div style={{ fontSize: "1.1rem", fontWeight: 800, color: offlineReady ? "#059669" : "#d97706" }}>
              {offlineReady ? "Ready for Offline Use" : "Warming Shell..."}
            </div>
            <div className="small muted">
              Persisted: {persisted ? "Yes (Protected)" : "Default"} ·{" "}
              {!persisted && (
                <button type="button" onClick={askPersist} style={{ background: "none", border: "none", color: "#0284c7", cursor: "pointer", padding: 0, textDecoration: "underline" }}>
                  Request Persistent
                </button>
              )}
            </div>
          </div>
        </div>

        <div style={{ marginTop: "1.25rem", display: "flex", gap: "0.75rem", alignItems: "center" }}>
          <button
            type="button"
            onClick={toggleSimulatedOffline}
            className={`btn small ${simulatedOffline ? "primary" : "secondary"}`}
          >
            {simulatedOffline ? "Disable Simulated Offline" : "Simulate Mountain Shadow Zone (Offline)"}
          </button>
        </div>
      </Card>
    </div>
  );
}
