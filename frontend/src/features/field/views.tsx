"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useMemo, useState, type FormEvent } from "react";
import { api, REPORT_SEVERITIES, REPORT_TYPES, unwrap, type Report, type ReportSeverity, type ReportType } from "@/shared/api";
import { usePrincipal, ROLE_LABEL } from "@/shared/auth";
import { formatCoords, humanize, shortId } from "@/shared/lib/format";
import { bboxAround, formatDistance, haversineMeters } from "@/shared/lib/geo";
import { usePreferences } from "@/shared/lib/preferences";
import { formatAge, formatDateTime } from "@/shared/lib/time";
import { useNow } from "@/shared/lib/useNow";
import { pilotLocale, reviewedLocales } from "@/shared/i18n";
import { MapLegend, MapView } from "@/shared/map";
import { Banner, Button, Card, ErrorNotice, Field, KeyValue, QueryState, Stat, StatusBadge } from "@/shared/ui";
import { buildNotices, NoticeDisclaimer, NoticeList } from "@/features/alerts";
import { ReportEvidence, useIncidents, useReport, useReports } from "@/features/incidents";
import { EdgePanel, edgeLabel, edgeLines, sortBySeverity, useEdges } from "@/features/network";
import { isReportPayload } from "./model";
import { useOffline } from "./OfflineProvider";
import { useGeolocation } from "./useGeolocation";

function LocationCard({ geo }: { geo: ReturnType<typeof useGeolocation> }) {
  const s = geo.state;
  return (
    <Card title="Your location">
      <div className="stack">
        {s.status === "ok" ? (
          <p>{formatCoords(s.fix.latitude, s.fix.longitude)} <span className="muted small">(±{s.fix.accuracy_m} m, read {formatAge(s.fix.at, new Date())})</span></p>
        ) : s.status === "locating" ? <p role="status">Finding your position…</p> : s.status === "idle" ? <p className="muted">Not read yet. The app reads your position only when you ask.</p> : <Banner tone="warn" title="Position unavailable"><p className="small">{s.message}</p></Banner>}
        <div><Button size="small" onClick={geo.locate}>Update my location</Button></div>
        <p className="small muted">Your position is read once on request, not tracked in the background.</p>
      </div>
    </Card>
  );
}

export function FieldHome() {
  const me = usePrincipal();
  const geo = useGeolocation(true);
  const { snapshot, syncNow, syncing, ready, simulatedOffline, toggleSimulatedOffline } = useOffline();
  const incidents = useIncidents("ACTIVE");
  const reports = useReports();
  const pending = snapshot?.operations.filter((o) => o.state !== "SYNCED") ?? [];
  const needsAttention = pending.filter((o) => ["NEEDS_LOGIN", "NEEDS_REVIEW", "FAILED_WITH_REASON"].includes(o.state)).length;
  const nearbyCount = useMemo(() => {
    if (geo.state.status !== "ok" || !reports.data) return null;
    const f = geo.state.fix;
    return reports.data.filter((r) => haversineMeters(f.latitude, f.longitude, r.location.latitude, r.location.longitude) <= 10_000).length;
  }, [geo.state, reports.data]);
  const notices = useMemo(() => buildNotices({ incidents: incidents.data ?? [], reports: reports.data ?? [], ownUserId: me.user_id, hrefs: { report: (id) => `/field/reports/${id}` } }), [incidents.data, reports.data, me.user_id]);

  return (
    <div className="stack">
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "0.85rem 1.25rem",
          borderRadius: "10px",
          background: simulatedOffline
            ? "linear-gradient(135deg, rgba(245, 158, 11, 0.15) 0%, rgba(180, 83, 9, 0.25) 100%)"
            : "linear-gradient(135deg, rgba(16, 185, 129, 0.12) 0%, rgba(5, 150, 105, 0.2) 100%)",
          border: `1px solid ${simulatedOffline ? "rgba(245, 158, 11, 0.4)" : "rgba(16, 185, 129, 0.35)"}`,
          flexWrap: "wrap",
          gap: "0.75rem",
        }}
      >
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontWeight: 600 }}>
            <span style={{ fontSize: "1.1rem" }}>{simulatedOffline ? "🟠" : "🟢"}</span>
            <span>
              Field Network Status: {simulatedOffline ? "SIMULATED OFFLINE (IndexedDB Local Queue Active)" : "ONLINE (Live API Sync Active)"}
            </span>
          </div>
          <p className="small muted" style={{ margin: "0.25rem 0 0 1.6rem" }}>
            {simulatedOffline
              ? "Requests are suspended to simulate remote mountain terrain with zero cellular connectivity. Reports will queue in IndexedDB."
              : "Connected to central PARVA servers. Auto-syncing background queue on network change."}
          </p>
        </div>
        <div style={{ display: "flex", gap: "0.5rem" }}>
          <Button
            size="small"
            variant={simulatedOffline ? "primary" : "default"}
            onClick={toggleSimulatedOffline}
          >
            {simulatedOffline ? "📡 Reconnect & Auto-Sync" : "📴 Simulate Offline (Cut Network)"}
          </Button>
          {!simulatedOffline && (
            <Button size="small" onClick={() => void syncNow()} busy={syncing}>
              Sync now
            </Button>
          )}
        </div>
      </div>

      <div className="grid cols-2">
        <Link className="btn large primary" href="/field/report/new">Report an incident</Link>
        <Link className="btn large" href="/field/road-update">Update road status</Link>
        <Link className="btn large" href="/field/queue">Send queue{ready ? ` (${pending.length})` : ""}</Link>
        <Link className="btn large" href="/field/nearby">Nearby and alerts</Link>
      </div>
      {needsAttention ? <Banner tone="warn" title={`${needsAttention} report(s) need your attention`}><p className="small">Open the send queue to sign in, edit or discard them.</p></Banner> : null}
      <div className="grid cols-2">
        <LocationCard geo={geo} />
        <Card title="Assignment">
          <KeyValue items={[["Role", ROLE_LABEL[me.role] ?? me.role], ["Organization", me.org_name], ["Assigned areas", `${me.jurisdiction_ids?.length ?? 0} jurisdiction(s)`]]} />
          <p className="small muted">What you see is limited to your assigned areas by the server.</p>
        </Card>
      </div>
      <div className="grid cols-3">
        <Card><Stat label="Waiting to send" value={pending.length} hint="Saved on this device" /></Card>
        <Card><Stat label="Active incidents in scope" value={incidents.isPending ? "…" : incidents.data?.length ?? "—"} /></Card>
        <Card><Stat label="Reports within 10 km" value={nearbyCount ?? "—"} hint={nearbyCount === null ? "Needs your location" : undefined} /></Card>
      </div>
      <Card title="Notices for you" actions={<Button size="small" onClick={() => void syncNow()} busy={syncing}>Sync now</Button>}>
        <NoticeList notices={notices.slice(0, 5)} emptyText="No notices right now." />
      </Card>
    </div>
  );
}

type Row = { key: string; kind: "local"; opId: string; title: string; state: string; at: string; reportId: string | null } | { key: string; kind: "server"; report: Report };

export function MyReports() {
  const me = usePrincipal();
  const { snapshot } = useOffline();
  const reports = useReports();
  const now = useNow(30_000);
  const rows = useMemo<Row[]>(() => {
    const serverIds = new Set((reports.data ?? []).map((r) => r.id));
    const local: Row[] = (snapshot?.operations ?? [])
      .filter((o) => !(o.state === "SYNCED" && o.serverResult && serverIds.has(o.serverResult.reportId)))
      .map((o) => ({ key: `op:${o.id}`, kind: "local", opId: o.id, title: isReportPayload(o.payload) ? `${humanize(o.payload.reportType)} · ${humanize(o.payload.severity)}` : "Report", state: o.state, at: o.createdAt, reportId: o.serverResult?.reportId ?? null }));
    const server: Row[] = (reports.data ?? []).filter((r) => r.reporter_id === me.user_id).map((report) => ({ key: report.id, kind: "server", report }));
    return [...local, ...server];
  }, [snapshot, reports.data, me.user_id]);

  return (
    <div className="stack">
      <Banner tone="info" title="Two different things"><p className="small">“Saved on device” means it is waiting on this phone. “Submitted” and later states come from the server.</p></Banner>
      <Card title="My reports">
        {reports.isError ? <ErrorNotice error={reports.error} subject="your submitted reports" onRetry={() => void reports.refetch()} /> : null}
        {reports.isPending ? <p role="status" className="muted">Loading…</p> : null}
        {rows.length === 0 && !reports.isPending ? <p className="muted">You have not reported anything yet.</p> : (
          <ul className="stack" style={{ listStyle: "none", padding: 0, margin: 0 }}>
            {rows.map((r) => r.kind === "local" ? (
              <li key={r.key} className="card row" style={{ padding: "0.7rem" }}>
                <strong>{r.title}</strong>
                <StatusBadge kind="queue" value={r.state} />
                <span className="small muted">saved {formatAge(r.at, now)}</span>
                <Link className="right" href={r.reportId ? `/field/reports/${r.reportId}` : "/field/queue"}>{r.reportId ? "Open" : "Queue"}</Link>
              </li>
            ) : (
              <li key={r.key} className="card" style={{ padding: "0.7rem" }}>
                <div className="row">
                  <strong>{humanize(r.report.report_type)}</strong>
                  <StatusBadge kind="review" value={r.report.review_state} />
                  <StatusBadge kind="severity" value={r.report.severity} />
                  <Link className="right" href={`/field/reports/${r.report.id}`}>Open</Link>
                </div>
                <div className="small muted">Observed {formatDateTime(r.report.observed_at)} · received {formatAge(r.report.received_at, now)}</div>
                <div className="small">{r.report.description.slice(0, 120)}</div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

function AmendForm({ report }: { report: Report }) {
  const qc = useQueryClient();
  const [reason, setReason] = useState("");
  const [description, setDescription] = useState(report.description);
  const [type, setType] = useState<ReportType>(report.report_type as ReportType);
  const [severity, setSeverity] = useState<ReportSeverity>(report.severity as ReportSeverity);
  const [error, setError] = useState<string | null>(null);
  const amend = useMutation({
    mutationFn: () =>
      unwrap(() =>
        api.POST("/api/v1/reports/{report_id}/amend", {
          params: { path: { report_id: report.id } },
          body: { reason: reason.trim(), report_type: type, severity, description: description.trim(), location: report.location, observed_at: report.observed_at, media_ids: report.media_ids },
        }),
      ),
    onSuccess: () => void qc.invalidateQueries({ predicate: (q) => q.queryKey.includes("reports") || q.queryKey.includes("report") }),
  });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (reason.trim().length < 3) return setError("Explain what changed (at least 3 characters).");
    if (description.trim().length < 3) return setError("The description needs at least 3 characters.");
    setError(null);
    amend.mutate();
  };
  return (
    <form className="stack" onSubmit={submit} aria-label="Amend report">
      <h3>Correct this report</h3>
      <p className="small muted">Amending needs a connection. It creates a new linked report; the original stays on record.</p>
      <Field label="Reason for the correction" htmlFor="am-reason" error={error}><input id="am-reason" value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
      <div className="grid cols-2">
        <Field label="Type" htmlFor="am-type"><select id="am-type" value={type} onChange={(e) => setType(e.target.value as ReportType)}>{REPORT_TYPES.map((t) => <option key={t} value={t}>{humanize(t)}</option>)}</select></Field>
        <Field label="Severity" htmlFor="am-sev"><select id="am-sev" value={severity} onChange={(e) => setSeverity(e.target.value as ReportSeverity)}>{REPORT_SEVERITIES.map((t) => <option key={t} value={t}>{humanize(t)}</option>)}</select></Field>
      </div>
      <Field label="Description" htmlFor="am-desc"><textarea id="am-desc" value={description} onChange={(e) => setDescription(e.target.value)} /></Field>
      {amend.isError ? <ErrorNotice error={amend.error} subject="this correction" /> : null}
      {amend.isSuccess ? <Banner tone="ok" title="Correction accepted by the server"><p className="small">New report <Link href={`/field/reports/${amend.data.id}`}>{shortId(amend.data.id)}</Link></p></Banner> : null}
      <Button type="submit" busy={amend.isPending} disabled={amend.isSuccess}>Send correction</Button>
    </form>
  );
}

export function ReportStatusDetail({ reportId }: { reportId: string }) {
  const query = useReport(reportId);
  return (
    <QueryState query={query} subject="report">
      {(r) => (
        <div className="stack">
          <ReportEvidence report={r} />
          {r.review_state === "MORE_INFO_NEEDED" ? <Banner tone="warn" title="A reviewer asked for more information"><p className="small">{r.rejection_notes ?? "See the notes above."} You can send a correction below.</p></Banner> : null}
          {r.amendment_of_report_id ? <p className="small">This corrects <Link href={`/field/reports/${r.amendment_of_report_id}`}>an earlier report</Link>.</p> : null}
          {r.review_state !== "VERIFIED" && r.review_state !== "REJECTED" ? <Card><AmendForm report={r} /></Card> : null}
        </div>
      )}
    </QueryState>
  );
}

const RADIUS_M = 5_000;

export function NearbyView() {
  const me = usePrincipal();
  const geo = useGeolocation(true);
  const reports = useReports();
  const incidents = useIncidents("ACTIVE");
  const [selected, setSelected] = useState<string | null>(null);
  const fix = geo.state.status === "ok" ? geo.state.fix : null;
  const bbox = useMemo(() => (fix ? bboxAround(fix.latitude, fix.longitude, RADIUS_M) : null), [fix]);
  const edges = useEdges(bbox, 13, Boolean(bbox));

  const nearReports = useMemo(() => {
    if (!fix) return [];
    return (reports.data ?? []).map((r) => ({ r, d: haversineMeters(fix.latitude, fix.longitude, r.location.latitude, r.location.longitude) })).filter((x) => x.d <= RADIUS_M).sort((a, b) => a.d - b.d);
  }, [fix, reports.data]);
  const nearEdges = useMemo(() => {
    if (!fix) return [];
    return sortBySeverity(edges.data?.features ?? []).filter((f) => f.props.accessibility_status !== "OPEN").map((f) => ({ f, d: Math.min(...f.coordinates.map(([x, y]) => haversineMeters(fix.latitude, fix.longitude, y, x))) })).filter((x) => x.d <= RADIUS_M);
  }, [fix, edges.data]);
  const notices = useMemo(
    () => buildNotices({ incidents: incidents.data ?? [], reports: reports.data ?? [], ownUserId: me.user_id, edges: nearEdges.map(({ f }) => ({ id: f.id, name: edgeLabel(f), status: f.props.accessibility_status, at: new Date().toISOString() })), hrefs: { report: (id) => `/field/reports/${id}` } }),
    [incidents.data, reports.data, me.user_id, nearEdges],
  );
  const selectedReport = selected ? nearReports.find(({ r }) => r.id === selected)?.r ?? null : null;
  const nearbyLines = edgeLines(edges.data?.features ?? []);
  const nearbyPoints = [
    ...(fix ? [{ id: "self", kind: "self" as const, lon: fix.longitude, lat: fix.latitude, label: "You are here", tone: "info" as const }] : []),
    ...nearReports.map(({ r }) => ({ id: r.id, kind: "report" as const, lon: r.location.longitude, lat: r.location.latitude, label: `${humanize(r.report_type)} report, ${humanize(r.review_state)}`, tone: r.severity === "CRITICAL" || r.severity === "HIGH" ? ("danger" as const) : ("warn" as const) })),
  ];

  return (
    <div className="stack">
      <LocationCard geo={geo} />
      {!fix ? <Banner tone="info" title="Location needed for distances"><p className="small">Update your location to see what is within {RADIUS_M / 1000} km. Alerts that do not depend on distance are shown below.</p></Banner> : null}
      <div className="split">
        <div className="stack">
          <MapView
            ariaLabel="Nearby reports and road status"
            height={380}
            lines={nearbyLines}
            points={nearbyPoints}
            selectedId={selected}
            onSelectPoint={setSelected}
            fitBounds={bbox}
            fitKey={fix ? `${fix.latitude.toFixed(3)}${fix.longitude.toFixed(3)}` : "none"}
          />
          <MapLegend lines={nearbyLines} points={nearbyPoints} />
          <Card title={`Reports near you (${nearReports.length})`}>
            {reports.isError ? <ErrorNotice error={reports.error} subject="reports" /> : null}
            {nearReports.length === 0 ? <p className="muted">{fix ? "No reports within range in your scope." : "Update your location to list nearby reports."}</p> : (
              <ul className="stack" style={{ listStyle: "none", padding: 0, margin: 0 }}>
                {nearReports.map(({ r, d }) => (
                  <li key={r.id} className="row" aria-current={selected === r.id ? "true" : undefined}>
                    <StatusBadge kind="severity" value={r.severity} />
                    <button type="button" className="linkish" onClick={() => setSelected(r.id)}>{humanize(r.report_type)}</button>
                    <StatusBadge kind="review" value={r.review_state} />
                    <span className="small muted right">{formatDistance(d)} · {formatAge(r.observed_at, new Date())}</span>
                    <Link href={`/field/reports/${r.id}`} className="small right">Open</Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
        <div className="stack" id="map-detail-panel">
          {selectedReport ? (
            <Card title="Selected report" actions={<Button size="small" onClick={() => setSelected(null)}>Close</Button>}>
              <ReportEvidence report={selectedReport} />
            </Card>
          ) : null}
          <Card title="Roads needing attention nearby">
            {nearEdges.length === 0 ? <p className="muted">{fix ? "No blocked, restricted or unverified segments within range. Segments not in the imported network are not covered." : "Needs your location."}</p> : (
              <ul className="stack" style={{ listStyle: "none", padding: 0, margin: 0 }}>
                {nearEdges.slice(0, 15).map(({ f, d }) => (
                  <li key={f.id} className="row"><StatusBadge kind="access" value={f.props.accessibility_status} /> {edgeLabel(f)} <span className="small muted right">{formatDistance(d)}</span></li>
                ))}
              </ul>
            )}
          </Card>
          <Card title="Alerts for you">
            <NoticeDisclaimer />
            <NoticeList notices={notices} emptyText="No alerts." />
          </Card>
        </div>
      </div>
    </div>
  );
}

export function RoadUpdate() {
  const geo = useGeolocation(true);
  const [selected, setSelected] = useState<string | null>(null);
  const fix = geo.state.status === "ok" ? geo.state.fix : null;
  const bbox = useMemo(() => (fix ? bboxAround(fix.latitude, fix.longitude, 1500) : null), [fix]);
  const edges = useEdges(bbox, 14, Boolean(bbox));
  const nearest = useMemo(() => {
    if (!fix) return [];
    return (edges.data?.features ?? []).map((f) => ({ f, d: Math.min(...f.coordinates.map(([x, y]) => haversineMeters(fix.latitude, fix.longitude, y, x))) })).sort((a, b) => a.d - b.d).slice(0, 12);
  }, [fix, edges.data]);
  return (
    <div className="stack">
      <Banner tone="info" title="How road updates work">
        <p className="small">If your role may set road status, you can do it below and the server records who and why. Otherwise, <Link href="/field/report/new">report what you see</Link>; a verifier decides.</p>
      </Banner>
      <LocationCard geo={geo} />
      <div className="split">
        <Card title="Road segments near you">
          {edges.isPending && bbox ? <p role="status" className="muted">Loading…</p> : null}
          {edges.isError ? <ErrorNotice error={edges.error} subject="nearby roads" onRetry={() => void edges.refetch()} /> : null}
          {!fix ? <p className="muted">Update your location to list nearby segments.</p> : nearest.length === 0 && !edges.isPending ? <p className="muted">No imported road segments within 1.5 km.</p> : (
            <ul className="stack" style={{ listStyle: "none", padding: 0, margin: 0 }}>
              {nearest.map(({ f, d }) => (
                <li key={f.id} className="row">
                  <button type="button" className="linkish" onClick={() => setSelected(f.id)}>{edgeLabel(f)}</button>
                  <StatusBadge kind="access" value={f.props.accessibility_status} />
                  <span className="small muted right">{formatDistance(d)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <div id="map-detail-panel">
          {selected ? <EdgePanel edgeId={selected} onClose={() => setSelected(null)} /> : <Card title="Details"><p className="muted">Choose a segment to see its status and, if permitted, update it.</p></Card>}
        </div>
      </div>
    </div>
  );
}

export function FieldProfile() {
  const me = usePrincipal();
  const [prefs, setPrefs] = usePreferences();
  const pilot = pilotLocale();
  const locales = reviewedLocales();
  return (
    <div className="stack">
      <Card title="Officer profile">
        <KeyValue items={[["Name", me.display_name], ["Email", me.email ?? "—"], ["Role", ROLE_LABEL[me.role] ?? me.role], ["Organization", me.org_name], ["Assigned areas", `${me.jurisdiction_ids?.length ?? 0} jurisdiction(s)`]]} />
        <p className="small muted">Assigned inspections and incidents are not available from the API yet.</p>
      </Card>
      <Card title="Language and data use">
        <div className="stack">
          <Field label="Notification language" htmlFor="pf-lang" hint={pilot ? `Pilot language: ${pilot}. It is used only for notices that have a reviewed template; other notices stay in English.` : "No pilot language is configured for this deployment."}>
            <select id="pf-lang" value={prefs.locale} onChange={(e) => setPrefs({ locale: e.target.value })}>
              {locales.map((l) => <option key={l} value={l}>{l === "en" ? "English" : l}</option>)}
              {pilot && !locales.includes(pilot) ? <option value={pilot}>{pilot} (no reviewed templates yet — English will be shown)</option> : null}
            </select>
          </Field>
          <label className="row"><input type="checkbox" checked={prefs.lowBandwidth} onChange={(e) => setPrefs({ lowBandwidth: e.target.checked })} /> Low-bandwidth mode (prioritize text, defer images)</label>
        </div>
      </Card>
    </div>
  );
}
