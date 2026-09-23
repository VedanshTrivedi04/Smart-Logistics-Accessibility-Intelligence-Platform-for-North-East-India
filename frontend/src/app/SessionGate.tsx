"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { SURFACE_LABEL, useSession } from "@/shared/auth";
import { AppShell, Banner, Button } from "@/shared/ui";
import { PersonaSwitcher } from "@/features/session";
import { NAV } from "./nav";

/**
 * Convenience gate: sends anonymous visitors to sign-in and wraps signed-in users in their shell.
 * This is not authorization; every API call is checked by the server regardless.
 */
export function SessionGate({ children }: { children: ReactNode }) {
  const session = useSession();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (session.status === "unauthenticated") {
      router.replace(`/login?next=${encodeURIComponent(pathname)}${session.expired ? "&reason=expired" : ""}`);
    }
  }, [session.status, session.expired, pathname, router]);

  if (session.status === "loading") return <p role="status" style={{ padding: "2rem" }}>Checking your session…</p>;
  if (session.status === "service_error") {
    return (
      <div style={{ padding: "2rem", maxWidth: 560 }}>
        <Banner tone="warn" title="The service could not confirm your session">
          <p className="small">{session.error?.message ?? "Service unavailable"}. This is a connection or service problem, not a sign-out. Your saved reports are safe.</p>
        </Banner>
        <div className="row" style={{ marginTop: "1rem" }}>
          <Button variant="primary" onClick={session.refresh}>Try again</Button>
          <a className="btn" href="/status">Service status</a>
        </div>
      </div>
    );
  }
  if (session.status !== "authenticated" || !session.principal) return <p role="status" style={{ padding: "2rem" }}>Redirecting to sign-in…</p>;

  const surface = session.surface;
  if (!surface) {
    return (
      <div style={{ padding: "2rem", maxWidth: 560 }}>
        <Banner tone="danger" title="No workspace for your role">
          <p className="small">Your role ({session.principal.role}) is not mapped to a portal in this build. Contact an administrator.</p>
        </Banner>
        <div style={{ marginTop: "1rem" }}><Button onClick={() => void session.logout()}>Sign out</Button></div>
      </div>
    );
  }
  return (
    <AppShell
      surfaceLabel={SURFACE_LABEL[surface]}
      nav={NAV[surface]}
      allowEmergencyToggle={surface === "government"}
      topActions={<PersonaSwitcher />}
    >
      {children}
    </AppShell>
  );
}

