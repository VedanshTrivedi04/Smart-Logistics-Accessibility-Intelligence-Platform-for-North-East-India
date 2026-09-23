import type { Metadata } from "next";
import Link from "next/link";
import { PublicRouteCheck } from "@/features/routing";

export const metadata: Metadata = {
  title: "Public Route & Corridor Checker | PARVA NER",
  description: "Check passability and travel advisories across North Eastern Region national highways and mountain corridors.",
};

export default function PublicPage() {
  return (
    <div style={{ minHeight: "100vh", background: "#0b0f19", color: "#f8fafc", padding: "1.5rem" }}>
      <header
        style={{
          maxWidth: "1000px",
          margin: "0 auto 2rem",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          paddingBottom: "1rem",
          borderBottom: "1px solid #1e293b",
          flexWrap: "wrap",
          gap: "1rem",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
          <div
            style={{
              width: "38px",
              height: "38px",
              borderRadius: "8px",
              background: "linear-gradient(135deg, #0284c7 0%, #0369a1 100%)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontWeight: 800,
              fontSize: "1.2rem",
              color: "#fff",
            }}
          >
            P
          </div>
          <div>
            <h1 style={{ fontSize: "1.25rem", margin: 0, fontWeight: 700, letterSpacing: "0.02em" }}>
              PARVA
            </h1>
            <p style={{ fontSize: "0.75rem", margin: 0, color: "#94a3b8" }}>
              NER Smart Logistics & Accessibility Intelligence Platform
            </p>
          </div>
        </div>

        <div style={{ display: "flex", gap: "0.75rem", alignItems: "center" }}>
          <Link
            href="/"
            style={{
              color: "#94a3b8",
              fontSize: "0.85rem",
              textDecoration: "none",
              padding: "0.4rem 0.8rem",
            }}
          >
            ← Platform Home
          </Link>
          <Link
            href="/login"
            style={{
              background: "linear-gradient(135deg, #0284c7 0%, #0369a1 100%)",
              color: "#ffffff",
              padding: "0.45rem 1rem",
              borderRadius: "6px",
              fontSize: "0.85rem",
              fontWeight: 600,
              textDecoration: "none",
            }}
          >
            Authorized Login
          </Link>
        </div>
      </header>

      <main>
        <PublicRouteCheck />
      </main>

      <footer
        style={{
          maxWidth: "1000px",
          margin: "3rem auto 1rem",
          textAlign: "center",
          borderTop: "1px solid #1e293b",
          paddingTop: "1.5rem",
          color: "#64748b",
          fontSize: "0.8rem",
        }}
      >
        <p>
          PARVA — Autonomous Logistics Accessibility & Disaster Response Infrastructure for North East India.
        </p>
        <p>
          Integrated with MDoNER, State Disaster Management Authorities (Assam, Meghalaya, Mizoram, Nagaland, Tripura, Arunachal Pradesh, Manipur, Sikkim), and NHAI.
        </p>
      </footer>
    </div>
  );
}
