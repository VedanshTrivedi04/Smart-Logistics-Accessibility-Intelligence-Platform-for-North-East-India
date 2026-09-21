"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState, type FormEvent } from "react";
import { api, setCsrfToken, unwrap, type Principal } from "@/shared/api";
import { SURFACE_HOME, surfaceForRole, useSession } from "@/shared/auth";
import { Banner, Button, ErrorNotice, Field } from "@/shared/ui";

const ROLES = [
  "REGIONAL_AUTHORITY", "STATE_AUTHORITY", "DISTRICT_VERIFIER", "EMERGENCY_COORDINATOR", "PLATFORM_ADMINISTRATOR",
  "FIELD_OFFICER", "LOCAL_AUTHORITY", "ROAD_INSPECTION", "FLEET_MANAGER", "DELIVERY_COORDINATOR", "TRANSPORT_OPERATOR",
] as const;

/** Only follow same-site relative destinations; anything else could be an open redirect. */
export function safeNext(next: string | null): string | null {
  return next && next.startsWith("/") && !next.startsWith("//") && !next.includes("\\") ? next : null;
}

export function landingFor(principal: Principal, next: string | null): string {
  const surface = surfaceForRole(principal.role);
  const safe = safeNext(next);
  return safe ?? (surface ? SURFACE_HOME[surface] : "/account");
}

interface SessionResponse {
  csrf_token?: string;
  principal?: Principal;
}

export function useCompleteLogin() {
  const session = useSession();
  const router = useRouter();
  const params = useSearchParams();
  return (result: SessionResponse) => {
    if (result.csrf_token) setCsrfToken(result.csrf_token);
    if (result.principal) {
      session.applyPrincipal(result.principal);
      router.replace(landingFor(result.principal, params.get("next")));
    } else {
      session.refresh();
    }
  };
}

function DevLogin() {
  const complete = useCompleteLogin();
  const [userId, setUserId] = useState("");
  const [orgId, setOrgId] = useState("");
  const [role, setRole] = useState<(typeof ROLES)[number]>("FIELD_OFFICER");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await unwrap(() => api.POST("/api/v1/auth/dev-session", { body: { user_id: userId.trim(), org_id: orgId.trim(), role } }));
      complete(res as SessionResponse);
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };
  return (
    <form className="stack" onSubmit={submit} aria-label="Development sign-in">
      <Banner tone="caution" title="Development sign-in"><p className="small">Only available when the backend runs with DEV_JWT_MODE. Never enabled in staging or production. Use the user and organization IDs from your seeded database.</p></Banner>
      <Field label="User ID" htmlFor="dev-user"><input id="dev-user" value={userId} onChange={(e) => setUserId(e.target.value)} required autoComplete="off" /></Field>
      <Field label="Organization ID" htmlFor="dev-org"><input id="dev-org" value={orgId} onChange={(e) => setOrgId(e.target.value)} required autoComplete="off" /></Field>
      <Field label="Role" htmlFor="dev-role"><select id="dev-role" value={role} onChange={(e) => setRole(e.target.value as (typeof ROLES)[number])}>{ROLES.map((r) => <option key={r} value={r}>{r}</option>)}</select></Field>
      {error ? <ErrorNotice error={error} subject="the development session" /> : null}
      <Button type="submit" busy={busy}>Start development session</Button>
    </form>
  );
}

export function LoginView() {
  const params = useSearchParams();
  const session = useSession();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const reason = params.get("reason");
  const devLogin = process.env.NEXT_PUBLIC_DEV_LOGIN === "1";

  const start = async () => {
    setBusy(true);
    setError(null);
    try {
      const { redirect_url } = (await unwrap(() => api.GET("/api/v1/auth/oidc/init"))) as { redirect_url?: string };
      if (!redirect_url) throw new Error("The identity provider is not configured");
      window.location.assign(redirect_url);
    } catch (e) {
      setError(e);
      setBusy(false);
    }
  };

  return (
    <div className="login-wrap">
      <div className="card login-card stack">
        <div>
          <h1>NER Logistics &amp; Accessibility Platform</h1>
          <p className="muted">Sign in with your organization account. What you see depends on your role and assigned area.</p>
        </div>
        {reason === "expired" || session.expired ? (
          <Banner tone="warn" title="Your session ended">
            <p className="small">Sign in again as the same user. Reports saved on this device are kept and will send once you are back in.</p>
          </Banner>
        ) : null}
        {session.status === "service_error" ? <ErrorNotice error={session.error} subject="your session" onRetry={session.refresh} /> : null}
        {error ? <ErrorNotice error={error} subject="sign-in" /> : null}
        <Button variant="primary" size="large" busy={busy} onClick={() => void start()}>Sign in</Button>
        {devLogin ? <DevLogin /> : null}
        <p className="small muted">This is a pilot system for authorized operators. There is no public access.</p>
      </div>
    </div>
  );
}
