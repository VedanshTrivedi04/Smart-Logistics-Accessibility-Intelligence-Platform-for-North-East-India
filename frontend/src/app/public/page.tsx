import type { Metadata } from "next";
import Link from "next/link";
import { PublicRouteCheck } from "@/features/routing";

export const metadata: Metadata = {
  title: "Public Route & Corridor Checker | PARVA NER",
  description: "Check real-time passability, elevation profiles, and travel advisories across North Eastern Region national highways and mountain corridors.",
};

export default function PublicPage() {
  return (
    <div
      style={{
        minHeight: "100vh",
        background: "radial-gradient(ellipse at 50% 0%, rgba(2, 132, 199, 0.04) 0%, transparent 60%), #f8fafc",
        color: "#0f172a",
        fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        padding: "1.5rem 1rem 3rem",
        ["--bg" as string]: "#f8fafc",
        ["--surface" as string]: "#ffffff",
        ["--surface-2" as string]: "#f1f5f9",
        ["--border" as string]: "#e2e8f0",
        ["--text" as string]: "#0f172a",
        ["--text-muted" as string]: "#64748b",
        ["--shadow" as string]: "0 4px 20px -2px rgba(15, 23, 42, 0.05), 0 2px 6px -1px rgba(15, 23, 42, 0.03)",
      } as React.CSSProperties}
    >
      {/* Top Floating Glass Navigation Header */}
      <header
        style={{
          maxWidth: "1060px",
          margin: "0 auto 2rem",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "0.85rem 1.4rem",
          background: "rgba(255, 255, 255, 0.92)",
          backdropFilter: "blur(12px)",
          border: "1px solid #e2e8f0",
          borderRadius: "16px",
          boxShadow: "0 4px 20px -2px rgba(15, 23, 42, 0.04), 0 2px 6px -1px rgba(15, 23, 42, 0.02)",
          flexWrap: "wrap",
          gap: "1rem",
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
              <h1
                style={{
                  fontSize: "1.25rem",
                  margin: 0,
                  fontWeight: 800,
                  letterSpacing: "-0.02em",
                  color: "#0f172a",
                }}
              >
                PARVA
              </h1>
              <span
                style={{
                  fontSize: "0.7rem",
                  fontWeight: 700,
                  background: "#eff6ff",
                  color: "#0284c7",
                  border: "1px solid #bfdbfe",
                  padding: "0.15rem 0.5rem",
                  borderRadius: "9999px",
                  letterSpacing: "0.03em",
                }}
              >
                CITIZEN & PUBLIC ACCESS
              </span>
            </div>
            <p style={{ fontSize: "0.78rem", margin: 0, color: "#64748b", fontWeight: 500 }}>
              North Eastern Region Smart Logistics & Accessibility Intelligence
            </p>
          </div>
        </div>

        <div style={{ display: "flex", gap: "0.75rem", alignItems: "center" }}>
          <Link
            href="/"
            style={{
              color: "#475569",
              fontSize: "0.85rem",
              fontWeight: 500,
              textDecoration: "none",
              padding: "0.5rem 0.9rem",
              borderRadius: "8px",
              border: "1px solid #e2e8f0",
              background: "#ffffff",
              transition: "all 0.15s ease",
            }}
          >
            ← Platform Home
          </Link>
          <Link
            href="/login"
            style={{
              background: "linear-gradient(135deg, #0284c7 0%, #0369a1 100%)",
              color: "#ffffff",
              padding: "0.5rem 1.15rem",
              borderRadius: "8px",
              fontSize: "0.85rem",
              fontWeight: 600,
              textDecoration: "none",
              boxShadow: "0 2px 8px rgba(2, 132, 199, 0.25)",
              transition: "all 0.15s ease",
            }}
          >
            Authorized Login →
          </Link>
        </div>
      </header>

      <main style={{ maxWidth: "1060px", margin: "0 auto" }}>
        <PublicRouteCheck />
      </main>

      <footer
        style={{
          maxWidth: "1060px",
          margin: "3.5rem auto 1rem",
          textAlign: "center",
          borderTop: "1px solid #e2e8f0",
          paddingTop: "2rem",
          color: "#64748b",
          fontSize: "0.82rem",
        }}
      >
        <p style={{ fontWeight: 600, color: "#334155", marginBottom: "0.35rem" }}>
          PARVA — Autonomous Logistics Accessibility & Disaster Response Infrastructure for North East India
        </p>
        <p style={{ margin: "0 auto 0.75rem", maxWidth: "780px", lineHeight: 1.5 }}>
          Integrated with Ministry of Development of North Eastern Region (MDoNER), National Highways Authority of India (NHAI), and State Disaster Management Authorities (Assam, Meghalaya, Mizoram, Nagaland, Tripura, Arunachal Pradesh, Manipur, Sikkim).
        </p>
        <p style={{ fontSize: "0.75rem", color: "#94a3b8" }}>
          © 2026 Government of India / North Eastern Council. Real-time road telemetry, hill highway hazard feeds & corridor routing.
        </p>
      </footer>
    </div>
  );
}
