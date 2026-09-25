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
        background: "radial-gradient(ellipse at 50% 0%, rgba(2, 132, 199, 0.05) 0%, transparent 60%), radial-gradient(ellipse at 80% 80%, rgba(16, 185, 129, 0.04) 0%, transparent 60%), #f8fafc",
        color: "#0f172a",
        fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      }}
    >
      {/* Top Floating Navigation Header */}
      <header
        style={{
          maxWidth: "1240px",
          margin: "0 auto",
          padding: "1rem 1.5rem",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          borderBottom: "1px solid #e2e8f0",
          background: "rgba(255, 255, 255, 0.88)",
          backdropFilter: "blur(12px)",
          position: "sticky",
          top: 0,
          zIndex: 30,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "0.85rem" }}>
          <div
            style={{
              width: "42px",
              height: "42px",
              borderRadius: "12px",
              background: "linear-gradient(135deg, #0284c7 0%, #0369a1 100%)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontWeight: 800,
              fontSize: "1.25rem",
              color: "#ffffff",
              boxShadow: "0 4px 12px rgba(2, 132, 199, 0.28)",
            }}
          >
            P
          </div>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <span style={{ fontSize: "1.35rem", fontWeight: 800, letterSpacing: "-0.02em", color: "#0f172a" }}>
                PARVA
              </span>
              <span
                style={{
                  fontSize: "0.7rem",
                  padding: "0.15rem 0.5rem",
                  borderRadius: "9999px",
                  background: "#eff6ff",
                  color: "#0284c7",
                  fontWeight: 700,
                  border: "1px solid #bfdbfe",
                  letterSpacing: "0.03em",
                }}
              >
                SIH 2026 PILOT
              </span>
            </div>
            <p style={{ fontSize: "0.78rem", margin: 0, color: "#64748b", fontWeight: 500 }}>
              Smart Logistics & Accessibility Intelligence for North East India
            </p>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "0.85rem", flexWrap: "wrap" }}>
          <Link
            href="/public"
            style={{
              color: "#475569",
              textDecoration: "none",
              fontSize: "0.88rem",
              fontWeight: 600,
              padding: "0.5rem 0.9rem",
              borderRadius: "8px",
              border: "1px solid #e2e8f0",
              background: "#ffffff",
              boxShadow: "0 1px 2px rgba(0,0,0,0.03)",
              transition: "all 0.15s ease",
            }}
          >
            🗺️ Public Corridor Check
          </Link>

          <Link
            href="/status"
            style={{
              color: "#64748b",
              textDecoration: "none",
              fontSize: "0.88rem",
              fontWeight: 500,
              padding: "0.5rem 0.75rem",
              borderRadius: "8px",
              transition: "color 0.15s ease",
            }}
          >
            System Status
          </Link>

          {isAuthenticated ? (
            <Link
              href={userSurface}
              style={{
                background: "linear-gradient(135deg, #0284c7 0%, #0369a1 100%)",
                color: "#ffffff",
                padding: "0.55rem 1.25rem",
                borderRadius: "8px",
                fontSize: "0.88rem",
                fontWeight: 600,
                textDecoration: "none",
                boxShadow: "0 2px 8px rgba(2, 132, 199, 0.28)",
                transition: "all 0.15s ease",
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
                fontSize: "0.88rem",
                fontWeight: 600,
                textDecoration: "none",
                boxShadow: "0 2px 8px rgba(2, 132, 199, 0.28)",
                transition: "all 0.15s ease",
              }}
            >
              Sign In / Role Switcher →
            </Link>
          )}
        </div>
      </header>

      {/* Hero Section */}
      <section
        style={{
          maxWidth: "1240px",
          margin: "0 auto",
          padding: "4.5rem 1.5rem 3rem",
          textAlign: "center",
        }}
      >
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "0.5rem",
            padding: "0.35rem 1rem",
            borderRadius: "9999px",
            background: "#eff6ff",
            border: "1px solid #bae6fd",
            marginBottom: "1.75rem",
            fontSize: "0.82rem",
            fontWeight: 700,
            color: "#0369a1",
            boxShadow: "0 2px 6px rgba(2, 132, 199, 0.08)",
          }}
        >
          <span
            style={{
              width: "8px",
              height: "8px",
              borderRadius: "50%",
              background: "#10b981",
              display: "inline-block",
              boxShadow: "0 0 0 3px rgba(16, 185, 129, 0.2)",
              animation: "livePulse 2s infinite",
            }}
          />
          MISSION-CRITICAL LOGISTICS & DISASTER RESPONSE FOR NER
        </div>

        <h1
          style={{
            fontSize: "clamp(2.4rem, 5.2vw, 3.8rem)",
            fontWeight: 800,
            lineHeight: 1.15,
            margin: "0 auto 1.5rem",
            maxWidth: "920px",
            letterSpacing: "-0.03em",
            color: "#0f172a",
          }}
        >
          Resilient Supply Chains &amp; Mountain Route Intelligence for{" "}
          <span
            style={{
              background: "linear-gradient(135deg, #0284c7 0%, #059669 100%)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
            }}
          >
            North East India
          </span>
        </h1>

        <p
          style={{
            fontSize: "1.15rem",
            lineHeight: 1.6,
            color: "#475569",
            maxWidth: "780px",
            margin: "0 auto 2.5rem",
          }}
        >
          PARVA unites regional governments, disaster authorities, emergency relief fleets, and frontline ground patrols across 8 North Eastern states into a unified, offline-resilient operational spatial intelligence network.
        </p>

        <div style={{ display: "flex", justifyContent: "center", gap: "1rem", flexWrap: "wrap" }}>
          <Link
            href="/login"
            style={{
              background: "linear-gradient(135deg, #0284c7 0%, #0369a1 100%)",
              color: "#ffffff",
              padding: "0.85rem 2.2rem",
              borderRadius: "12px",
              fontSize: "1.05rem",
              fontWeight: 700,
              textDecoration: "none",
              boxShadow: "0 8px 24px rgba(2, 132, 199, 0.3)",
              display: "inline-flex",
              alignItems: "center",
              gap: "0.5rem",
              transition: "transform 0.15s ease, box-shadow 0.15s ease",
            }}
          >
            Launch Command Switchboard ⚡
          </Link>
          <Link
            href="/public"
            style={{
              background: "#ffffff",
              color: "#0f172a",
              padding: "0.85rem 1.9rem",
              borderRadius: "12px",
              fontSize: "1.05rem",
              fontWeight: 600,
              textDecoration: "none",
              border: "1.5px solid #cbd5e1",
              boxShadow: "0 2px 8px rgba(0, 0, 0, 0.04)",
              display: "inline-flex",
              alignItems: "center",
              gap: "0.5rem",
              transition: "all 0.15s ease",
            }}
          >
            Check Highway Passability →
          </Link>
        </div>
      </section>

      {/* Live Pilot Corridors Telemetry Counters */}
      <section style={{ maxWidth: "1240px", margin: "0 auto 3.5rem", padding: "0 1.5rem" }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
            gap: "1.25rem",
          }}
        >
          <div
            style={{
              background: "#ffffff",
              padding: "1.5rem",
              borderRadius: "16px",
              border: "1px solid #e2e8f0",
              boxShadow: "0 4px 20px -2px rgba(15, 23, 42, 0.05)",
              textAlign: "center",
              transition: "transform 0.2s ease",
            }}
          >
            <div style={{ fontSize: "2.2rem", fontWeight: 800, color: "#0284c7", letterSpacing: "-0.02em" }}>19 Nodes</div>
            <div style={{ fontSize: "0.95rem", fontWeight: 700, color: "#0f172a", marginTop: "0.35rem" }}>Active Pilot Corridors</div>
            <div style={{ fontSize: "0.8rem", color: "#64748b", marginTop: "0.2rem" }}>NH-27 & NH-6 Mountain Spine</div>
          </div>

          <div
            style={{
              background: "#ffffff",
              padding: "1.5rem",
              borderRadius: "16px",
              border: "1px solid #e2e8f0",
              boxShadow: "0 4px 20px -2px rgba(15, 23, 42, 0.05)",
              textAlign: "center",
              transition: "transform 0.2s ease",
            }}
          >
            <div style={{ fontSize: "2.2rem", fontWeight: 800, color: "#059669", letterSpacing: "-0.02em" }}>3 Bridges</div>
            <div style={{ fontSize: "0.95rem", fontWeight: 700, color: "#0f172a", marginTop: "0.35rem" }}>Monitored River Structures</div>
            <div style={{ fontSize: "0.8rem", color: "#64748b", marginTop: "0.2rem" }}>Saraighat, Kolia Bhomora, Naranarayan</div>
          </div>

          <div
            style={{
              background: "#ffffff",
              padding: "1.5rem",
              borderRadius: "16px",
              border: "1px solid #e2e8f0",
              boxShadow: "0 4px 20px -2px rgba(15, 23, 42, 0.05)",
              textAlign: "center",
              transition: "transform 0.2s ease",
            }}
          >
            <div style={{ fontSize: "2.2rem", fontWeight: 800, color: "#d97706", letterSpacing: "-0.02em" }}>Sub-Second</div>
            <div style={{ fontSize: "0.95rem", fontWeight: 700, color: "#0f172a", marginTop: "0.35rem" }}>AI Reroute Engine</div>
            <div style={{ fontSize: "0.8rem", color: "#64748b", marginTop: "0.2rem" }}>PostGIS Dijkstra & Hazmat Policies</div>
          </div>

          <div
            style={{
              background: "#ffffff",
              padding: "1.5rem",
              borderRadius: "16px",
              border: "1px solid #e2e8f0",
              boxShadow: "0 4px 20px -2px rgba(15, 23, 42, 0.05)",
              textAlign: "center",
              transition: "transform 0.2s ease",
            }}
          >
            <div style={{ fontSize: "2.2rem", fontWeight: 800, color: "#7c3aed", letterSpacing: "-0.02em" }}>100% Offline</div>
            <div style={{ fontSize: "0.95rem", fontWeight: 700, color: "#0f172a", marginTop: "0.35rem" }}>Frontline PWA Sync</div>
            <div style={{ fontSize: "0.8rem", color: "#64748b", marginTop: "0.2rem" }}>IndexedDB Zero-Data Resilience</div>
          </div>
        </div>
      </section>

      {/* 4 Dedicated Portals Grid */}
      <section style={{ maxWidth: "1240px", margin: "0 auto 4.5rem", padding: "0 1.5rem" }}>
        <div style={{ textAlign: "center", marginBottom: "3rem" }}>
          <h2 style={{ fontSize: "2rem", fontWeight: 800, color: "#0f172a", letterSpacing: "-0.02em", margin: "0 0 0.5rem" }}>
            Four Integrated Operational Portals
          </h2>
          <p style={{ color: "#64748b", maxWidth: "680px", margin: "0 auto", fontSize: "1rem" }}>
            Engineered for distinct stakeholders with strict role-based access control and dedicated workflows.
          </p>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "1.5rem" }}>
          {/* Government Portal */}
          <div
            style={{
              padding: "1.85rem",
              borderRadius: "18px",
              background: "#ffffff",
              border: "1px solid #bae6fd",
              boxShadow: "0 4px 20px -2px rgba(2, 132, 199, 0.08)",
              display: "flex",
              flexDirection: "column",
              justifyContent: "space-between",
              transition: "all 0.2s ease",
            }}
          >
            <div>
              <div style={{ fontSize: "2.5rem", marginBottom: "0.85rem" }}>🏛️</div>
              <h3 style={{ fontSize: "1.35rem", fontWeight: 800, margin: "0 0 0.5rem", color: "#0284c7" }}>
                Government Command
              </h3>
              <p style={{ fontSize: "0.9rem", color: "#475569", lineHeight: 1.55, marginBottom: "1.25rem" }}>
                Regional MDoNER & State Authority dashboard. Real-time road status closures, incident verification, emergency priority corridors, and network impact analytics.
              </p>
              <ul style={{ fontSize: "0.82rem", color: "#334155", paddingLeft: "1.1rem", margin: "0 0 1.75rem", lineHeight: 1.65 }}>
                <li>MDoNER regional corridor monitoring</li>
                <li>District hazard verification workflow</li>
                <li>Strategic fuel & medical route protection</li>
              </ul>
            </div>
            <Link
              href="/gov"
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "0.4rem",
                textAlign: "center",
                background: "#f0f9ff",
                color: "#0284c7",
                border: "1.5px solid #bae6fd",
                padding: "0.7rem 1.2rem",
                borderRadius: "10px",
                fontWeight: 700,
                textDecoration: "none",
                fontSize: "0.92rem",
                transition: "all 0.15s ease",
              }}
            >
              Enter Gov Command →
            </Link>
          </div>

          {/* Logistics & Fleet Portal */}
          <div
            style={{
              padding: "1.85rem",
              borderRadius: "18px",
              background: "#ffffff",
              border: "1px solid #a7f3d0",
              boxShadow: "0 4px 20px -2px rgba(16, 185, 129, 0.08)",
              display: "flex",
              flexDirection: "column",
              justifyContent: "space-between",
              transition: "all 0.2s ease",
            }}
          >
            <div>
              <div style={{ fontSize: "2.5rem", marginBottom: "0.85rem" }}>🛰️</div>
              <h3 style={{ fontSize: "1.35rem", fontWeight: 800, margin: "0 0 0.5rem", color: "#059669" }}>
                Logistics & Fleet Command
              </h3>
              <p style={{ fontSize: "0.9rem", color: "#475569", lineHeight: 1.55, marginBottom: "1.25rem" }}>
                Real-time vehicle GPS telemetry, cold-chain medical consignment tracking, convoy dispatch, autonomous rerouting, and driver cockpit.
              </p>
              <ul style={{ fontSize: "0.82rem", color: "#334155", paddingLeft: "1.1rem", margin: "0 0 1.75rem", lineHeight: 1.65 }}>
                <li>Live vehicle telemetry & breadcrumbs</li>
                <li>Tier-1 life-saving consignment priority</li>
                <li>Driver cockpit with 1-touch hazard reporting</li>
              </ul>
            </div>
            <Link
              href="/logistics"
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "0.4rem",
                textAlign: "center",
                background: "#ecfdf5",
                color: "#059669",
                border: "1.5px solid #a7f3d0",
                padding: "0.7rem 1.2rem",
                borderRadius: "10px",
                fontWeight: 700,
                textDecoration: "none",
                fontSize: "0.92rem",
                transition: "all 0.15s ease",
              }}
            >
              Enter Fleet Portal →
            </Link>
          </div>

          {/* Field Operations App */}
          <div
            style={{
              padding: "1.85rem",
              borderRadius: "18px",
              background: "#ffffff",
              border: "1px solid #fde68a",
              boxShadow: "0 4px 20px -2px rgba(217, 119, 6, 0.08)",
              display: "flex",
              flexDirection: "column",
              justifyContent: "space-between",
              transition: "all 0.2s ease",
            }}
          >
            <div>
              <div style={{ fontSize: "2.5rem", marginBottom: "0.85rem" }}>📱</div>
              <h3 style={{ fontSize: "1.35rem", fontWeight: 800, margin: "0 0 0.5rem", color: "#d97706" }}>
                Field Operations PWA
              </h3>
              <p style={{ fontSize: "0.9rem", color: "#475569", lineHeight: 1.55, marginBottom: "1.25rem" }}>
                Offline-first mobile client for mountain patrols and road inspectors. Capture GPS photos, landslides, and road subsidence in zero-signal river valleys.
              </p>
              <ul style={{ fontSize: "0.82rem", color: "#334155", paddingLeft: "1.1rem", margin: "0 0 1.75rem", lineHeight: 1.65 }}>
                <li>Zero-connectivity IndexedDB persistence</li>
                <li>Multi-step photo & GPS hazard wizard</li>
                <li>Built-in offline/online network simulator</li>
              </ul>
            </div>
            <Link
              href="/field"
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "0.4rem",
                textAlign: "center",
                background: "#fffbeb",
                color: "#d97706",
                border: "1.5px solid #fde68a",
                padding: "0.7rem 1.2rem",
                borderRadius: "10px",
                fontWeight: 700,
                textDecoration: "none",
                fontSize: "0.92rem",
                transition: "all 0.15s ease",
              }}
            >
              Enter Field App →
            </Link>
          </div>

          {/* Public Citizen Portal */}
          <div
            style={{
              padding: "1.85rem",
              borderRadius: "18px",
              background: "#ffffff",
              border: "1px solid #e9d5ff",
              boxShadow: "0 4px 20px -2px rgba(124, 58, 237, 0.08)",
              display: "flex",
              flexDirection: "column",
              justifyContent: "space-between",
              transition: "all 0.2s ease",
            }}
          >
            <div>
              <div style={{ fontSize: "2.5rem", marginBottom: "0.85rem" }}>🗺️</div>
              <h3 style={{ fontSize: "1.35rem", fontWeight: 800, margin: "0 0 0.5rem", color: "#7c3aed" }}>
                Citizen Route Checker
              </h3>
              <p style={{ fontSize: "0.9rem", color: "#475569", lineHeight: 1.55, marginBottom: "1.25rem" }}>
                Public highway safety checker for residents and travelers. Live passability status, mountain elevation profiles, and estimated transit times across NER routes.
              </p>
              <ul style={{ fontSize: "0.82rem", color: "#334155", paddingLeft: "1.1rem", margin: "0 0 1.75rem", lineHeight: 1.65 }}>
                <li>No login required for citizens</li>
                <li>Interactive mountain elevation profile</li>
                <li>Real-time hill driving safety guidance</li>
              </ul>
            </div>
            <Link
              href="/public"
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "0.4rem",
                textAlign: "center",
                background: "#faf5ff",
                color: "#7c3aed",
                border: "1.5px solid #e9d5ff",
                padding: "0.7rem 1.2rem",
                borderRadius: "10px",
                fontWeight: 700,
                textDecoration: "none",
                fontSize: "0.92rem",
                transition: "all 0.15s ease",
              }}
            >
              Open Route Checker →
            </Link>
          </div>
        </div>
      </section>

      {/* 8 North East States Strip */}
      <section style={{ maxWidth: "1240px", margin: "0 auto 4rem", padding: "0 1.5rem" }}>
        <div
          style={{
            background: "#ffffff",
            borderRadius: "16px",
            border: "1px solid #e2e8f0",
            padding: "1.25rem 1.5rem",
            boxShadow: "0 2px 10px rgba(0,0,0,0.03)",
          }}
        >
          <div style={{ textAlign: "center", fontSize: "0.8rem", color: "#64748b", fontWeight: 600, letterSpacing: "0.05em", marginBottom: "0.75rem" }}>
            OPERATING ACROSS ALL 8 NORTH EASTERN STATES
          </div>
          <div
            style={{
              display: "flex",
              justifyContent: "center",
              flexWrap: "wrap",
              gap: "0.6rem",
            }}
          >
            {["Assam", "Meghalaya", "Arunachal Pradesh", "Nagaland", "Manipur", "Mizoram", "Tripura", "Sikkim"].map((st) => (
              <span
                key={st}
                style={{
                  background: "#f1f5f9",
                  color: "#334155",
                  padding: "0.35rem 0.85rem",
                  borderRadius: "9999px",
                  fontSize: "0.82rem",
                  fontWeight: 600,
                  border: "1px solid #e2e8f0",
                }}
              >
                {st}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer
        style={{
          maxWidth: "1240px",
          margin: "0 auto",
          padding: "2.5rem 1.5rem",
          borderTop: "1px solid #e2e8f0",
          textAlign: "center",
          color: "#64748b",
          fontSize: "0.85rem",
        }}
      >
        <p style={{ margin: "0 0 0.5rem", fontWeight: 600, color: "#334155" }}>
          PARVA — AI-Based Smart Logistics and Accessibility Intelligence Platform for North Eastern Region (NER)
        </p>
        <p style={{ margin: 0, fontSize: "0.8rem" }}>
          Built for Smart India Hackathon (SIH 2026) · Ministry of Development of North Eastern Region (MDoNER) &amp; North Eastern Council
        </p>
      </footer>
    </div>
  );
}
