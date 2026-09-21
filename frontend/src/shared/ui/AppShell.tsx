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
}

export function AppShell({ surfaceLabel, nav, children, allowEmergencyToggle }: Props) {
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
          <div className="brand">NER Logistics<br /><span className="small muted">{surfaceLabel}</span></div>
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
            <div className="row">
              <Button className="menu-toggle" size="small" aria-expanded={menuOpen} aria-label="Toggle navigation" onClick={() => setMenuOpen((o) => !o)}>
                <Menu size={18} aria-hidden="true" />
              </Button>
              <div className="identity">
                <strong>{principal?.display_name ?? "Not signed in"}</strong>
                <span className="muted">
                  {principal ? `${ROLE_LABEL[principal.role] ?? principal.role} · ${principal.org_name}` : ""}
                </span>
              </div>
            </div>
            <div className="row">
              {allowEmergencyToggle && session.can("RESPOND_EMERGENCY") ? (
                <label className="row small" style={{ gap: "0.4rem" }}>
                  <input type="checkbox" checked={emergency} onChange={(e) => setEmergency(e.target.checked)} />
                  <ShieldAlert size={16} aria-hidden="true" /> Emergency mode
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
