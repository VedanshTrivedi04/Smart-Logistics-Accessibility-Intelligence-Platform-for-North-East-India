"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { api, unwrap, type Principal } from "@/shared/api";
import { Banner, Button, ErrorNotice } from "@/shared/ui";
import { useCompleteLogin } from "./LoginView";

interface OrgChoice {
  org_id: string;
  org_name: string;
  org_kind: string;
  role: string;
}
interface CallbackResult {
  status?: string;
  csrf_token?: string;
  principal?: Principal;
  selection_token?: string;
  org_choices?: OrgChoice[];
}

/**
 * Landing page for the identity provider redirect. Configure OIDC_REDIRECT_URI on the
 * backend to this page (<frontend origin>/auth/callback): the backend callback returns
 * JSON and sets the session cookie, so it is called with fetch, not navigated to.
 */
export function AuthCallback() {
  const params = useSearchParams();
  const complete = useCompleteLogin();
  const started = useRef(false);
  const [error, setError] = useState<unknown>(null);
  const [choices, setChoices] = useState<{ token: string; orgs: OrgChoice[] } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const code = params.get("code");
    const state = params.get("state");
    if (!code || !state) {
      setError(new Error("The sign-in response is missing its code or state. Start again from the sign-in page."));
      return;
    }
    // A single-use state: the URL is cleaned so a refresh cannot replay it.
    window.history.replaceState(null, "", "/auth/callback");
    unwrap(() => api.GET("/api/v1/auth/oidc/callback", { params: { query: { code, state } } }))
      .then((r) => {
        const res = r as CallbackResult;
        if (res.status === "org_selection_required" && res.selection_token && res.org_choices) setChoices({ token: res.selection_token, orgs: res.org_choices });
        else complete(res);
      })
      .catch(setError);
    // complete is stable enough for a one-shot effect guarded by `started`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const choose = async (orgId: string) => {
    if (!choices) return;
    setBusy(true);
    try {
      const res = await unwrap(() => api.POST("/api/v1/auth/select-org", { body: { org_id: orgId, selection_token: choices.token } }));
      complete(res as CallbackResult);
    } catch (e) {
      setError(e);
      setBusy(false);
    }
  };

  return (
    <div className="login-wrap">
      <div className="card login-card stack">
        <h1>Signing you in</h1>
        {error ? <><ErrorNotice error={error} subject="sign-in" /><a className="btn" href="/login">Back to sign-in</a></> : null}
        {choices ? (
          <div className="stack">
            <Banner tone="info" title="Choose which organization to work as"><p className="small">You belong to more than one. What you can see depends on this choice, and you can switch later by signing in again.</p></Banner>
            {choices.orgs.map((o) => <Button key={o.org_id} size="large" busy={busy} onClick={() => void choose(o.org_id)}>{o.org_name} — {o.role.replace(/_/g, " ").toLowerCase()}</Button>)}
          </div>
        ) : !error ? <p role="status" className="muted">Completing sign-in…</p> : null}
      </div>
    </div>
  );
}
