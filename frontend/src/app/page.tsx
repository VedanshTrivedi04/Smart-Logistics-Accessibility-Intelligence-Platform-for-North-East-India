"use client";

import Link from "next/link";
import { SURFACE_HOME, useSession } from "@/shared/auth";

export default function LandingPage() {
  const session = useSession();
  const isAuthenticated = session.status === "authenticated";
  const userSurface = session.surface ? SURFACE_HOME[session.surface] : "/gov";

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "linear-gradient(180deg, #070b14 0%, #0c1322 50%, #080d1a 100%)",
        color: "#f1f5f9",
        fontFamily: "system-ui, -apple-system, sans-serif",
      }}
    >
      {/* Top Navigation Bar */}
      <header
        style={{
          maxWidth: "1200px",
          margin: "0 auto",
          padding: "1.25rem 1.5rem",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          borderBottom: "1px solid rgba(56, 189, 248, 0.15)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "0.85rem" }}>
          <div
            style={{
              width: "42px",
              height: "42px",
              borderRadius: "10px",
              background: "linear-gradient(135deg, #0284c7 0%, #0369a1 100%)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontWeight: 800,
              fontSize: "1.3rem",
              color: "#ffffff",
              boxShadow: "0 0 20px rgba(2, 132, 199, 0.4)",
            }}
          >
            P
          </div>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <span style={{ fontSize: "1.35rem", fontWeight: 800, letterSpacing: "0.05em", color: "#f8fafc" }}>
                PARVA
              </span>
              <span
                style={{
                  fontSize: "0.7rem",
                  padding: "0.15rem 0.45rem",
                  borderRadius: "4px",
                  background: "rgba(56, 189, 248, 0.15)",
                  color: "#38bdf8",
                  fontWeight: 600,
                  border: "1px solid rgba(56, 189, 248, 0.3)",
                }}
              >
                SIH 2026 PILOT
              </span>
            </div>
            <p style={{ fontSize: "0.78rem", margin: 0, color: "#94a3b8" }}>
              Smart Logistics & Accessibility Intelligence for North East India
            </p>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
          <Link
            href="/public"
            style={{
              color: "#94a3b8",
              textDecoration: "none",
              fontSize: "0.9rem",
              fontWeight: 500,
              padding: "0.5rem 0.75rem",
              borderRadius: "6px",
              transition: "color 0.2s",
            }}
          >
            Citizen Route Check
          </Link>

          {isAuthenticated ? (
            <Link
              href={userSurface}
              style={{
                background: "linear-gradient(135deg, #0284c7 0%, #0369a1 100%)",
                color: "#ffffff",
                padding: "0.55rem 1.25rem",
                borderRadius: "8px",
                fontSize: "0.9rem",
                fontWeight: 600,
                textDecoration: "none",
                boxShadow: "0 4px 14px rgba(2, 132, 199, 0.35)",
              }}
            >
              Open Active Portal ({session.principal?.display_name}) →
            </Link>
          ) : (
            <Link
              href="/login"
              style={{
                background: "linear-gradient(135deg, #0284c7 0%, #0369a1 100%)",
                color: "#ffffff",
                padding: "0.55rem 1.25rem",
                borderRadius: "8px",
                fontSize: "0.9rem",
                fontWeight: 600,
                textDecoration: "none",
                boxShadow: "0 4px 14px rgba(2, 132, 199, 0.35)",
              }}
            >
              Sign In / Role Selector →
            </Link>
          )}
        </div>
      </header>

      {/* Hero Section */}
      <section
        style={{
          maxWidth: "1200px",
          margin: "0 auto",
          padding: "4rem 1.5rem 2.5rem",
          textAlign: "center",
        }}
      >
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "0.5rem",
            padding: "0.35rem 0.9rem",
            borderRadius: "9999px",
            background: "rgba(14, 165, 233, 0.1)",
            border: "1px solid rgba(56, 189, 248, 0.3)",
            marginBottom: "1.5rem",
            fontSize: "0.85rem",
            color: "#38bdf8",
          }}
        >
          <span style={{ animation: "pulse 2s infinite" }}>●</span> Mission-Critical Logistics & Disaster Response for NER
        </div>

        <h1
          style={{
            fontSize: "clamp(2.2rem, 5vw, 3.8rem)",
            fontWeight: 800,
            lineHeight: 1.15,
            margin: "0 auto 1.5rem",
            maxWidth: "900px",
            background: "linear-gradient(135deg, #ffffff 0%, #cbd5e1 50%, #38bdf8 100%)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
          }}
        >
          Resilient Supply Chains & Route Intelligence for North East India
        </h1>

        <p
          style={{
            fontSize: "1.15rem",
            lineHeight: 1.6,
            color: "#94a3b8",
            maxWidth: "750px",
            margin: "0 auto 2.5rem",
          }}
        >
          PARVA unites regional governments, disaster authorities, emergency logistics fleets, and frontline ground patrols across 8 North Eastern states into a unified, offline-resilient operational network.
        </p>

        <div style={{ display: "flex", justifyContent: "center", gap: "1rem", flexWrap: "wrap" }}>
          <Link
            href="/login"
            style={{
              background: "linear-gradient(135deg, #0284c7 0%, #024670 100%)",
              color: "#ffffff",
              padding: "0.85rem 2rem",
              borderRadius: "10px",
              fontSize: "1.05rem",
              fontWeight: 700,
              textDecoration: "none",
              border: "1px solid rgba(56, 189, 248, 0.5)",
              boxShadow: "0 8px 24px rgba(2, 132, 199, 0.4)",
            }}
          >
            Launch Command Switchboard ⚡
          </Link>
          <Link
            href="/public"
            style={{
              background: "rgba(15, 23, 42, 0.8)",
              color: "#e2e8f0",
              padding: "0.85rem 1.75rem",
              borderRadius: "10px",
              fontSize: "1.05rem",
              fontWeight: 600,
              textDecoration: "none",
              border: "1px solid #334155",
            }}
          >
            Check Highway Passability →
          </Link>
        </div>
      </section>

      {/* Live Pilot Corridors Telemetry Counters */}
      <section style={{ maxWidth: "1200px", margin: "0 auto 3rem", padding: "0 1.5rem" }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            gap: "1rem",
            padding: "1.5rem",
            background: "rgba(15, 23, 42, 0.7)",
            borderRadius: "14px",
            border: "1px solid rgba(51, 65, 85, 0.6)",
            backdropFilter: "blur(12px)",
          }}
        >
          <div style={{ textAlign: "center", padding: "0.5rem" }}>
            <div style={{ fontSize: "2rem", fontWeight: 800, color: "#38bdf8" }}>19 Nodes</div>
            <div style={{ fontSize: "0.85rem", color: "#94a3b8", marginTop: "0.25rem" }}>Active Pilot Corridors</div>
            <div style={{ fontSize: "0.75rem", color: "#64748b" }}>NH-27 & NH-6 Mountain Spine</div>
          </div>
          <div style={{ textAlign: "center", padding: "0.5rem" }}>
            <div style={{ fontSize: "2rem", fontWeight: 800, color: "#34d399" }}>3 Bridges</div>
            <div style={{ fontSize: "0.85rem", color: "#94a3b8", marginTop: "0.25rem" }}>Monitored Structures</div>
            <div style={{ fontSize: "0.75rem", color: "#64748b" }}>Saraighat, Kolia Bhomora, Naranarayan</div>
          </div>
          <div style={{ textAlign: "center", padding: "0.5rem" }}>
            <div style={{ fontSize: "2rem", fontWeight: 800, color: "#f59e0b" }}>Sub-Second</div>
            <div style={{ fontSize: "0.85rem", color: "#94a3b8", marginTop: "0.25rem" }}>AI Reroute Engine</div>
            <div style={{ fontSize: "0.75rem", color: "#64748b" }}>PostGIS Dijkstra & Hazmat Policies</div>
          </div>
          <div style={{ textAlign: "center", padding: "0.5rem" }}>
            <div style={{ fontSize: "2rem", fontWeight: 800, color: "#a78bfa" }}>100% Offline</div>
            <div style={{ fontSize: "0.85rem", color: "#94a3b8", marginTop: "0.25rem" }}>Frontline PWA Sync</div>
            <div style={{ fontSize: "0.75rem", color: "#64748b" }}>IndexedDB Zero-Data Resilience</div>
          </div>
        </div>
      </section>

      {/* 4 Dedicated Portals Grid */}
      <section style={{ maxWidth: "1200px", margin: "0 auto 4rem", padding: "0 1.5rem" }}>
        <h2 style={{ fontSize: "1.8rem", fontWeight: 700, textAlign: "center", marginBottom: "0.5rem", color: "#f8fafc" }}>
          Four Integrated Operational Portals
        </h2>
        <p style={{ textAlign: "center", color: "#94a3b8", maxWidth: "650px", margin: "0 auto 2.5rem" }}>
          Engineered for distinct stakeholders with strict role-based access control and dedicated workflows.
        </p>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(270px, 1fr))", gap: "1.5rem" }}>
          {/* Government Portal */}
          <div
            style={{
              padding: "1.75rem",
              borderRadius: "14px",
              background: "linear-gradient(135deg, rgba(30, 41, 59, 0.7) 0%, rgba(15, 23, 42, 0.8) 100%)",
              border: "1px solid rgba(56, 189, 248, 0.25)",
              display: "flex",
              flexDirection: "column",
              justifyContent: "space-between",
            }}
          >
            <div>
              <div style={{ fontSize: "2.5rem", marginBottom: "1rem" }}>🏛️</div>
              <h3 style={{ fontSize: "1.3rem", fontWeight: 700, margin: "0 0 0.5rem", color: "#38bdf8" }}>
                Government Command
              </h3>
              <p style={{ fontSize: "0.9rem", color: "#94a3b8", lineHeight: 1.5, marginBottom: "1rem" }}>
                Regional MDoNER & State Authority dashboard. Real-time road status closures, incident verification, emergency priority corridors, and network impact analytics.
              </p>
              <ul style={{ fontSize: "0.8rem", color: "#cbd5e1", paddingLeft: "1.1rem", margin: "0 0 1.5rem", lineHeight: 1.6 }}>
                <li>MDoNER regional corridor monitoring</li>
                <li>District hazard verification workflow</li>
                <li>Strategic fuel & medical route protection</li>
              </ul>
            </div>
            <Link
              href="/gov"
              style={{
                display: "inline-block",
                textAlign: "center",
                background: "rgba(56, 189, 248, 0.15)",
                color: "#38bdf8",
                border: "1px solid rgba(56, 189, 248, 0.3)",
                padding: "0.6rem 1rem",
                borderRadius: "8px",
                fontWeight: 600,
                textDecoration: "none",
                fontSize: "0.9rem",
              }}
            >
              Enter Gov Command →
            </Link>
          </div>

          {/* Logistics & Fleet Portal */}
          <div
            style={{
              padding: "1.75rem",
              borderRadius: "14px",
              background: "linear-gradient(135deg, rgba(30, 41, 59, 0.7) 0%, rgba(15, 23, 42, 0.8) 100%)",
              border: "1px solid rgba(52, 211, 153, 0.25)",
              display: "flex",
              flexDirection: "column",
              justifyContent: "space-between",
            }}
          >
            <div>
              <div style={{ fontSize: "2.5rem", marginBottom: "1rem" }}>🛰️</div>
              <h3 style={{ fontSize: "1.3rem", fontWeight: 700, margin: "0 0 0.5rem", color: "#34d399" }}>
                Logistics & Fleet Command
              </h3>
              <p style={{ fontSize: "0.9rem", color: "#94a3b8", lineHeight: 1.5, marginBottom: "1rem" }}>
                Real-time vehicle GPS telemetry, cold-chain medical consignment tracking, convoy dispatch, autonomous rerouting, and a driver cockpit.
              </p>
              <ul style={{ fontSize: "0.8rem", color: "#cbd5e1", paddingLeft: "1.1rem", margin: "0 0 1.5rem", lineHeight: 1.6 }}>
                <li>Live vehicle telemetry & breadcrumbs</li>
                <li>Tier-1 life-saving consignment priority</li>
                <li>Driver cockpit with 1-touch hazard reporting</li>
              </ul>
            </div>
            <Link
              href="/logistics"
              style={{
                display: "inline-block",
                textAlign: "center",
                background: "rgba(52, 211, 153, 0.15)",
                color: "#34d399",
                border: "1px solid rgba(52, 211, 153, 0.3)",
                padding: "0.6rem 1rem",
                borderRadius: "8px",
                fontWeight: 600,
                textDecoration: "none",
                fontSize: "0.9rem",
              }}
            >
              Enter Fleet Portal →
            </Link>
          </div>

          {/* Field Operations App */}
          <div
            style={{
              padding: "1.75rem",
              borderRadius: "14px",
              background: "linear-gradient(135deg, rgba(30, 41, 59, 0.7) 0%, rgba(15, 23, 42, 0.8) 100%)",
              border: "1px solid rgba(251, 191, 36, 0.25)",
              display: "flex",
              flexDirection: "column",
              justifyContent: "space-between",
            }}
          >
            <div>
              <div style={{ fontSize: "2.5rem", marginBottom: "1rem" }}>📱</div>
              <h3 style={{ fontSize: "1.3rem", fontWeight: 700, margin: "0 0 0.5rem", color: "#fbbf24" }}>
                Field Operations PWA
              </h3>
              <p style={{ fontSize: "0.9rem", color: "#94a3b8", lineHeight: 1.5, marginBottom: "1rem" }}>
                Offline-first mobile client for mountain patrols and road inspectors. Capture GPS photos, landslides, and road subsidence in no-signal river valleys with automatic sync upon reconnection.
              </p>
              <ul style={{ fontSize: "0.8rem", color: "#cbd5e1", paddingLeft: "1.1rem", margin: "0 0 1.5rem", lineHeight: 1.6 }}>
                <li>Zero-connectivity IndexedDB persistence</li>
                <li>Multi-step photo & GPS hazard wizard</li>
                <li>Built-in offline/online network simulator</li>
              </ul>
            </div>
            <Link
              href="/field"
              style={{
                display: "inline-block",
                textAlign: "center",
                background: "rgba(251, 191, 36, 0.15)",
                color: "#fbbf24",
                border: "1px solid rgba(251, 191, 36, 0.3)",
                padding: "0.6rem 1rem",
                borderRadius: "8px",
                fontWeight: 600,
                textDecoration: "none",
                fontSize: "0.9rem",
              }}
            >
              Enter Field App →
            </Link>
          </div>

          {/* Public Citizen Portal */}
          <div
            style={{
              padding: "1.75rem",
              borderRadius: "14px",
              background: "linear-gradient(135deg, rgba(30, 41, 59, 0.7) 0%, rgba(15, 23, 42, 0.8) 100%)",
              border: "1px solid rgba(167, 139, 250, 0.25)",
              display: "flex",
              flexDirection: "column",
              justifyContent: "space-between",
            }}
          >
            <div>
              <div style={{ fontSize: "2.5rem", marginBottom: "1rem" }}>🗺️</div>
              <h3 style={{ fontSize: "1.3rem", fontWeight: 700, margin: "0 0 0.5rem", color: "#a78bfa" }}>
                Citizen Route Checker
              </h3>
              <p style={{ fontSize: "0.9rem", color: "#94a3b8", lineHeight: 1.5, marginBottom: "1rem" }}>
                Public highway safety checker for residents and inter-state travelers. Live passability status, monsoon advisories, and estimated transit times across major NER routes.
              </p>
              <ul style={{ fontSize: "0.8rem", color: "#cbd5e1", paddingLeft: "1.1rem", margin: "0 0 1.5rem", lineHeight: 1.6 }}>
                <li>No login required for citizens</li>
                <li>10 verified regional hub corridors</li>
                <li>Real-time hill driving safety guidance</li>
              </ul>
            </div>
            <Link
              href="/public"
              style={{
                display: "inline-block",
                textAlign: "center",
                background: "rgba(167, 139, 250, 0.15)",
                color: "#a78bfa",
                border: "1px solid rgba(167, 139, 250, 0.3)",
                padding: "0.6rem 1rem",
                borderRadius: "8px",
                fontWeight: 600,
                textDecoration: "none",
                fontSize: "0.9rem",
              }}
            >
              Open Route Checker →
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer
        style={{
          maxWidth: "1200px",
          margin: "0 auto",
          padding: "2rem 1.5rem",
          borderTop: "1px solid #1e293b",
          textAlign: "center",
          color: "#64748b",
          fontSize: "0.85rem",
        }}
      >
        <p style={{ margin: "0 0 0.5rem" }}>
          PARVA — AI-Based Smart Logistics and Accessibility Intelligence Platform for North Eastern Region (NER)
        </p>
        <p style={{ margin: 0, fontSize: "0.78rem" }}>
          Built for Smart India Hackathon (SIH 2026) · Ministry of Development of North Eastern Region (MDoNER)
        </p>
      </footer>
    </div>
  );
}
