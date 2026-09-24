"use client";

import { useQuery } from "@tanstack/react-query";
import { Menu, ShieldAlert, UserCircle2, WifiOff, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { api, unwrap } from "@/shared/api";
import type { Capability } from "@/shared/api/types";
import { ROLE_LABEL, useSession } from "@/shared/auth";
import { usePreferencesEffect } from "@/shared/lib/preferences";
import { useEmergencyMode } from "./emergency";
import { Banner, Button } from "./primitives";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  requires?: readonly Capability[];
  /** Match only the exact path (used for surface home links). */
  exact?: boolean;
}

const AnnounceContext = createContext<(message: string) => void>(() => undefined);

/** Polite screen-reader announcements for status changes such as "Saved on device". */
export function useAnnounce(): (message: string) => void {
  return useContext(AnnounceContext);
}

function useServiceHealth(enabled: boolean) {
  return useQuery({
    queryKey: ["service-health"],
    queryFn: async () => {
      await unwrap(() => api.GET("/health/ready"));
      return true;
    },
    enabled,
    refetchInterval: 60_000,
    retry: false,
  });
}

interface Props {
  surfaceLabel: string;
  nav: NavItem[];
  children: ReactNode;
  allowEmergencyToggle?: boolean;
  topActions?: ReactNode;
}

export function AppShell({ surfaceLabel, nav, children, allowEmergencyToggle, topActions }: Props) {
  usePreferencesEffect();
  const pathname = usePathname();
  const session = useSession();
  const [menuOpen, setMenuOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [emergency, setEmergency] = useEmergencyMode();
  const health = useServiceHealth(session.status === "authenticated");
  const [online, setOnline] = useState(true);

  useEffect(() => {
    setOnline(navigator.onLine);
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener("online", up);
    window.addEventListener("offline", down);
    return () => {
      window.removeEventListener("online", up);
      window.removeEventListener("offline", down);
    };
  }, []);

  useEffect(() => setMenuOpen(false), [pathname]);

  const announce = useCallback((m: string) => {
    setMessage("");
    // Clearing first makes repeated identical messages re-announce.
    setTimeout(() => setMessage(m), 30);
  }, []);

  const principal = session.principal;
  const items = nav.filter((n) => session.canAny(n.requires));
  const isActive = (item: NavItem) => (item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(`${item.href}/`));
  const emergencyOn = Boolean(allowEmergencyToggle && emergency && session.can("RESPOND_EMERGENCY"));

  return (
    <AnnounceContext.Provider value={announce}>
      <a className="skip-link" href="#main">Skip to main content</a>
      <div className={`shell ${emergencyOn ? "emergency" : ""}`}>
        <aside className="sidebar" data-open={menuOpen} aria-label="Primary">
          <div className="brand" style={{ display: "flex", alignItems: "center", gap: "0.75rem", padding: "0.25rem 0.25rem 1.25rem" }}>
            <div
              style={{
                width: "36px",
                height: "36px",
                borderRadius: "10px",
                background: "linear-gradient(135deg, #0284c7 0%, #0369a1 100%)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontWeight: 800,
                fontSize: "1.15rem",
                color: "#ffffff",
                boxShadow: "0 2px 8px rgba(2, 132, 199, 0.25)",
                flex: "none",
              }}
            >
              P
            </div>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
                <span style={{ fontSize: "1.15rem", fontWeight: 800, color: "#0f172a", letterSpacing: "-0.01em" }}>
                  PARVA
                </span>
                <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: "#10b981", display: "inline-block" }} />
              </div>
              <span
                style={{
                  fontSize: "0.72rem",
                  fontWeight: 600,
                  color: "#0369a1",
                  background: "#e0f2fe",
                  padding: "0.1rem 0.45rem",
                  borderRadius: "9999px",
                  display: "inline-block",
                  marginTop: "0.15rem",
                }}
              >
                {surfaceLabel}
              </span>
            </div>
          </div>
          <nav aria-label={`${surfaceLabel} navigation`}>
            <ul>
              {items.map((item) => (
                <li key={item.href}>
                  <Link href={item.href} className="nav-link" aria-current={isActive(item) ? "page" : undefined}>
                    <item.icon size={18} aria-hidden="true" />
                    <span>{item.label}</span>
                  </Link>
                </li>
              ))}
              <li>
                <Link href="/account" className="nav-link" aria-current={pathname === "/account" ? "page" : undefined}>
                  <UserCircle2 size={18} aria-hidden="true" />
                  <span>Account &amp; scope</span>
                </Link>
              </li>
            </ul>
          </nav>
        </aside>
        <div className="main">
          <header className="topbar">
            <div className="row" style={{ gap: "0.75rem", alignItems: "center" }}>
              <Button className="menu-toggle" size="small" aria-expanded={menuOpen} aria-label="Toggle navigation" onClick={() => setMenuOpen((o) => !o)}>
                <Menu size={18} aria-hidden="true" />
              </Button>
              <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
                <div
                  style={{
                    width: "34px",
                    height: "34px",
                    borderRadius: "50%",
                    background: "#e0f2fe",
                    color: "#0284c7",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontWeight: 700,
                    fontSize: "0.82rem",
                    border: "1.5px solid #bae6fd",
                    flex: "none",
                  }}
                >
                  {principal?.display_name ? principal.display_name.slice(0, 2).toUpperCase() : "U"}
                </div>
                <div className="identity">
                  <strong style={{ color: "#0f172a", fontSize: "0.9rem" }}>{principal?.display_name ?? "Not signed in"}</strong>
                  <span className="muted" style={{ fontSize: "0.78rem" }}>
                    {principal ? `${ROLE_LABEL[principal.role] ?? principal.role} · ${principal.org_name}` : ""}
                  </span>
                </div>
              </div>
            </div>
            <div className="row" style={{ gap: "0.75rem", alignItems: "center" }}>
              <Link
                href="/public"
                target="_blank"
                style={{
                  fontSize: "0.82rem",
                  fontWeight: 600,
                  color: "#0369a1",
                  background: "#f0f9ff",
                  padding: "0.3rem 0.65rem",
                  borderRadius: "6px",
                  border: "1px solid #bae6fd",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "0.3rem",
                  textDecoration: "none",
                }}
                title="Open Public Citizen Route Checker in new tab"
              >
                🗺️ Public Portal ↗
              </Link>
              {topActions}
              {allowEmergencyToggle && session.can("RESPOND_EMERGENCY") ? (
                <label
                  className="row small"
                  style={{
                    gap: "0.4rem",
                    padding: "0.25rem 0.6rem",
                    borderRadius: "6px",
                    background: emergency ? "#fef2f2" : "#f1f5f9",
                    border: emergency ? "1px solid #fecaca" : "1px solid #e2e8f0",
                    color: emergency ? "#b91c1c" : "#475569",
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  <input type="checkbox" checked={emergency} onChange={(e) => setEmergency(e.target.checked)} />
                  <ShieldAlert size={15} aria-hidden="true" /> Emergency mode
                </label>
              ) : null}
              <Button size="small" onClick={() => void session.logout()}>Sign out</Button>
            </div>
          </header>
          <main id="main" className="content" tabIndex={-1}>
            {emergencyOn ? (
              <Banner tone="danger" title="Emergency mode is on">
                <p className="small">This changes how information is prioritized on your screen. It does not change permissions, road status or any record.</p>
              </Banner>
            ) : null}
            {session.offlineCached ? (
              <Banner tone="warn" title="Working offline as a previously verified identity">
                <p className="small">The server could not be reached, so your last confirmed identity is being used. Your session is not re-validated until the connection returns. Server data may be missing or out of date.</p>
              </Banner>
            ) : !online ? (
              <Banner tone="warn" title="This device reports no network">
                <p className="small"><WifiOff size={14} aria-hidden="true" /> This is only a hint; actual request results decide whether data is current.</p>
              </Banner>
            ) : null}
            {health.isError ? (
              <Banner tone="warn" title="Service degraded">
                <p className="small">The readiness check failed, so some data may be unavailable or stale. See <Link href="/status">service status</Link>.</p>
              </Banner>
            ) : null}
            {children}
          </main>
        </div>
      </div>
      <div aria-live="polite" role="status" className="sr-only">{message}</div>
    </AnnounceContext.Provider>
  );
}
