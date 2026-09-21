"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useEffect, useState } from "react";
import { api, unwrap } from "@/shared/api";
import { ROLE_LABEL, SURFACE_HOME, SURFACE_LABEL, surfaceForRole, useSession } from "@/shared/auth";
import { pilotLocale, reviewedLocales } from "@/shared/i18n";
import { shortId } from "@/shared/lib/format";
import { usePreferences } from "@/shared/lib/preferences";
import { getOfflineDb } from "@/shared/offline";
import { Banner, Button, Card, ErrorNotice, Field, KeyValue, PageHeader } from "@/shared/ui";
import { purgeOwner } from "@/features/field";

export function AccountView() {
  const { principal, logout, offlineCached } = useSession();
  const [prefs, setPrefs] = usePreferences();
  const [local, setLocal] = useState<{ unsent: number; drafts: number } | null>(null);
  const [confirm, setConfirm] = useState(false);
  const pilot = pilotLocale();

  useEffect(() => {
    if (!principal) return;
    let cancelled = false;
    getOfflineDb()
      .then(async (db) => {
        const ops = await db.getAllFromIndex("operations", "by_owner", principal.user_id);
        const drafts = await db.getAllFromIndex("drafts", "by_owner", principal.user_id);
        if (!cancelled) setLocal({ unsent: ops.filter((o) => o.state !== "SYNCED").length, drafts: drafts.length });
      })
      .catch(() => !cancelled && setLocal(null));
    return () => {
      cancelled = true;
    };
  }, [principal]);

  if (!principal) return null;
  const surface = surfaceForRole(principal.role);
  const caps = [...principal.capabilities].sort();

  return (
    <div className="stack">
      <PageHeader title="Account and scope" subtitle="Who the server believes you are, and what that allows." />
      {offlineCached ? <Banner tone="warn" title="Offline identity"><p className="small">Shown from the last time the server confirmed it. It is re-checked when the connection returns.</p></Banner> : null}
      <div className="grid cols-2">
        <Card title="Identity">
          <KeyValue
            items={[
              ["Name", principal.display_name],
              ["Email", principal.email ?? "—"],
              ["Role", ROLE_LABEL[principal.role] ?? principal.role],
              ["Organization", `${principal.org_name} (${principal.org_kind.toLowerCase().replace("_", " ")})`],
              ["Assigned areas", principal.jurisdiction_ids?.length ? principal.jurisdiction_ids.map(shortId).join(", ") : "None recorded"],
              ["Session", principal.session_id ? shortId(principal.session_id) : "—"],
              ["Workspace", surface ? <Link key="s" href={SURFACE_HOME[surface]}>{SURFACE_LABEL[surface]}</Link> : "No workspace for this role"],
            ]}
          />
          {principal.dev_mode ? <Banner tone="caution" title="Development session"><p className="small">This session was created without an identity provider.</p></Banner> : null}
        </Card>
        <Card title="What your role allows">
          <p className="small muted">Menus adapt to these permissions, but the server checks every request itself.</p>
          <ul className="row" style={{ listStyle: "none", padding: 0, margin: 0 }}>
            {caps.map((c) => <li key={c} className="badge tone-neutral">{c.replace(/_/g, " ").toLowerCase()}</li>)}
          </ul>
        </Card>
      </div>
      <Card title="Language and display">
        <div className="stack">
          <Field label="Notification language" htmlFor="ac-lang" hint={pilot ? `Pilot language: ${pilot}. Used only where a reviewed template exists; otherwise English.` : "No pilot language is configured."}>
            <select id="ac-lang" value={prefs.locale} onChange={(e) => setPrefs({ locale: e.target.value })}>
              {reviewedLocales().map((l) => <option key={l} value={l}>{l === "en" ? "English" : l}</option>)}
            </select>
          </Field>
          <label className="row"><input type="checkbox" checked={prefs.lowBandwidth} onChange={(e) => setPrefs({ lowBandwidth: e.target.checked })} /> Low-bandwidth mode</label>
        </div>
      </Card>
      <Card title="Data on this device">
        <div className="stack">
          {local ? <p>{local.unsent} unsent report(s) and {local.drafts} draft(s) are stored on this device for you.</p> : <p className="muted small">No local field data or storage unavailable.</p>}
          <p className="small muted">Signing out ends your session and clears cached server data. Unsent reports stay on this device for you only and cannot be read by another account.</p>
          {local && (local.unsent > 0 || local.drafts > 0) ? (
            confirm ? (
              <Banner tone="danger" title="Delete unsent work from this device?">
                <p className="small">This permanently removes {local.unsent} unsent report(s), {local.drafts} draft(s) and their photos. It cannot be undone.</p>
                <div className="row">
                  <Button variant="danger" size="small" onClick={async () => { const db = await getOfflineDb(); await purgeOwner(db, principal.user_id); setConfirm(false); setLocal({ unsent: 0, drafts: 0 }); }}>Delete permanently</Button>
                  <Button size="small" onClick={() => setConfirm(false)}>Keep them</Button>
                </div>
              </Banner>
            ) : <div><Button size="small" onClick={() => setConfirm(true)}>Delete my unsent work from this device…</Button></div>
          ) : null}
        </div>
      </Card>
      <Card title="Sessions">
        <div className="row">
          <Button onClick={() => void logout()}>Sign out</Button>
          <Button onClick={() => void logout(true)}>Sign out everywhere</Button>
        </div>
      </Card>
    </div>
  );
}

export function ForbiddenView() {
  const { principal } = useSession();
  const surface = principal ? surfaceForRole(principal.role) : null;
  return (
    <div className="stack" style={{ maxWidth: 640 }}>
      <PageHeader title="You do not have access to this page" />
      <Banner tone="danger" title="Not permitted for your role">
        <p className="small">Hiding menus is a convenience. The server independently refuses data your role or area does not cover, so this page could not have shown it.</p>
      </Banner>
      <div className="row">
        {surface ? <Link className="btn primary" href={SURFACE_HOME[surface]}>Go to your workspace</Link> : null}
        <Link className="btn" href="/account">Account and scope</Link>
      </div>
    </div>
  );
}

export function ServiceStatusView() {
  const ready = useQuery({ queryKey: ["status", "ready"], queryFn: () => unwrap(() => api.GET("/health/ready")) as Promise<unknown>, retry: false, refetchInterval: 20_000 });
  const live = useQuery({ queryKey: ["status", "live"], queryFn: () => unwrap(() => api.GET("/health/live")) as Promise<unknown>, retry: false, refetchInterval: 20_000 });
  return (
    <div className="stack">
      <PageHeader title="Service status" subtitle="Checked every 20 seconds while this page is open." />
      <Card title="API">
        {live.isError ? <ErrorNotice error={live.error} subject="the API" onRetry={() => void live.refetch()} /> : live.isPending ? <p role="status" className="muted">Checking…</p> : <Banner tone="ok" title="The API process is running" />}
      </Card>
      <Card title="Dependencies (database and cache)">
        {ready.isError ? <ErrorNotice error={ready.error} subject="dependency status" onRetry={() => void ready.refetch()} /> : ready.isPending ? <p role="status" className="muted">Checking…</p> : <><Banner tone="ok" title="Ready to serve requests" /><pre className="mono small" style={{ whiteSpace: "pre-wrap" }}>{JSON.stringify(ready.data, null, 2)}</pre></>}
        <p className="small muted">When a dependency is down, screens show a service error, never an empty result. Weather and external feeds are not connected in this build, so their freshness cannot be shown.</p>
      </Card>
    </div>
  );
}
