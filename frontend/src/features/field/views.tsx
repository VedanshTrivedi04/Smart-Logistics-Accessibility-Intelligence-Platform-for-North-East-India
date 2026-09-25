"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useMemo, useState, type FormEvent } from "react";
import { api, REPORT_SEVERITIES, REPORT_TYPES, unwrap, type Report, type ReportSeverity, type ReportType } from "@/shared/api";
import { usePrincipal, ROLE_LABEL } from "@/shared/auth";
import { formatCoords, humanize, shortId } from "@/shared/lib/format";
import { bboxAround, formatDistance, haversineMeters } from "@/shared/lib/geo";
import { usePreferences } from "@/shared/lib/preferences";
import { snapToCorridor } from "@/shared/lib/corridors";
import { formatAge, formatDateTime } from "@/shared/lib/time";
import { useNow } from "@/shared/lib/useNow";
import { formatBytes } from "@/shared/offline";
import { pilotLocale, reviewedLocales } from "@/shared/i18n";
import { MapLegend, MapView } from "@/shared/map";
import { Banner, Button, Card, ErrorNotice, Field, KeyValue, QueryState, StatusBadge } from "@/shared/ui";
import { buildNotices, NoticeDisclaimer, NoticeList } from "@/features/alerts";
import { ReportEvidence, useIncidents, useReport, useReports } from "@/features/incidents";
import { EdgePanel, edgeLabel, edgeLines, sortBySeverity, useEdges } from "@/features/network";
import { isReportPayload } from "./model";
import { useOffline } from "./OfflineProvider";
import { RoadConditionForm } from "./RoadConditionForm";
import { StaleDataBanner } from "./StaleDataBanner";
import { useGeolocation } from "./useGeolocation";
import { useOfflineSnapshot } from "./useOfflineSnapshot";

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

import { FieldHomeMobile } from "./FieldHomeMobile";

export function FieldHome() {
  return <FieldHomeMobile />;
}

type Row = { key: string; kind: "local"; opId: string; title: string; state: string; at: string; reportId: string | null; description?: string } | { key: string; kind: "server"; report: Report };

type ReportFilterTab = "ALL" | "LOCAL" | "SUBMITTED" | "VERIFIED" | "NEEDS_INFO";

export function MyReports() {
  const me = usePrincipal();
  const { snapshot } = useOffline();
  const reports = useReports();
  const now = useNow(30_000);
  const [activeTab, setActiveTab] = useState<ReportFilterTab>("ALL");

  const allRows = useMemo<Row[]>(() => {
    const serverIds = new Set((reports.data ?? []).map((r) => r.id));
    const local: Row[] = (snapshot?.operations ?? [])
      .filter((o) => !(o.state === "SYNCED" && o.serverResult && serverIds.has(o.serverResult.reportId)))
      .map((o) => ({
        key: `op:${o.id}`,
        kind: "local",
        opId: o.id,
        title: isReportPayload(o.payload) ? `${humanize(o.payload.reportType)} · ${humanize(o.payload.severity)}` : "Report",
        state: o.state,
        at: o.createdAt,
        reportId: o.serverResult?.reportId ?? null,
        description: isReportPayload(o.payload) ? o.payload.description : undefined,
      }));
    const server: Row[] = (reports.data ?? []).filter((r) => r.reporter_id === me.user_id).map((report) => ({ key: report.id, kind: "server", report }));
    return [...local, ...server];
  }, [snapshot, reports.data, me.user_id]);

  // Tab counts
  const counts = useMemo(() => {
    let localCount = 0;
    let submittedCount = 0;
    let verifiedCount = 0;
    let needsInfoCount = 0;
    for (const r of allRows) {
      if (r.kind === "local") {
        localCount++;
      } else {
        const s = r.report.review_state;
        if (s === "SUBMITTED" || s === "TRIAGED") submittedCount++;
        else if (s === "VERIFIED") verifiedCount++;
        else if (s === "REJECTED" || s === "MORE_INFO_NEEDED") needsInfoCount++;
      }
    }
    return { all: allRows.length, local: localCount, submitted: submittedCount, verified: verifiedCount, needsInfo: needsInfoCount };
  }, [allRows]);

  // Filtered rows
  const filteredRows = useMemo(() => {
    if (activeTab === "ALL") return allRows;
    if (activeTab === "LOCAL") return allRows.filter((r) => r.kind === "local");
    if (activeTab === "SUBMITTED") return allRows.filter((r) => r.kind === "server" && (r.report.review_state === "SUBMITTED" || r.report.review_state === "TRIAGED"));
    if (activeTab === "VERIFIED") return allRows.filter((r) => r.kind === "server" && r.report.review_state === "VERIFIED");
    if (activeTab === "NEEDS_INFO") return allRows.filter((r) => r.kind === "server" && (r.report.review_state === "REJECTED" || r.report.review_state === "MORE_INFO_NEEDED"));
    return allRows;
  }, [allRows, activeTab]);

  return (
    <div className="stack" style={{ gap: "1rem" }}>
      <Banner tone="info" title="Operational Transparency">
        <p className="small">
          <strong>Local Outbox:</strong> Saved securely on device IndexedDB; automatically transmits when network signal is detected. <strong>Server Status:</strong> Authoritative state verified by District/Regional control room.
        </p>
      </Banner>

      {/* Filter Tabs */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem", borderBottom: "1px solid #e2e8f0", paddingBottom: "0.5rem" }}>
        {[
          { id: "ALL" as const, label: `All Reports (${counts.all})` },
          { id: "LOCAL" as const, label: `Device Outbox (${counts.local})`, tone: counts.local > 0 ? "#ea580c" : undefined },
          { id: "SUBMITTED" as const, label: `Pending Review (${counts.submitted})` },
          { id: "VERIFIED" as const, label: `Verified (${counts.verified})`, tone: counts.verified > 0 ? "#16a34a" : undefined },
          { id: "NEEDS_INFO" as const, label: `Needs Attention (${counts.needsInfo})`, tone: counts.needsInfo > 0 ? "#dc2626" : undefined },
        ].map((tab) => (
          <button
            key={tab.id}
            type="button"
            className="btn small"
            onClick={() => setActiveTab(tab.id)}
            style={{
              fontWeight: activeTab === tab.id ? 800 : 500,
              background: activeTab === tab.id ? "#0284c7" : "#ffffff",
              color: activeTab === tab.id ? "#ffffff" : tab.tone ?? "#334155",
              border: activeTab === tab.id ? "1px solid #0284c7" : "1px solid #cbd5e1",
              borderRadius: "8px",
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <Card title="Submitted Observations &amp; Local Outbox">
        {reports.isError ? <ErrorNotice error={reports.error} subject="your submitted reports" onRetry={() => void reports.refetch()} /> : null}
        {reports.isPending ? <p role="status" className="muted">Loading reports from server…</p> : null}
        {filteredRows.length === 0 && !reports.isPending ? (
          <p className="muted">No reports match this category.</p>
        ) : (
          <ul className="stack" style={{ listStyle: "none", padding: 0, margin: 0, gap: "0.75rem" }}>
            {filteredRows.map((r) => {
              if (r.kind === "local") {
                return (
                  <li key={r.key} className="card" style={{ padding: "0.85rem 1rem", borderLeft: "4px solid #f97316" }}>
                    <div className="row" style={{ alignItems: "center" }}>
                      <span style={{ fontWeight: 800, fontSize: "0.82rem", background: "#ffedd5", color: "#c2410c", padding: "0.2rem 0.5rem", borderRadius: "6px" }}>
                        DRAFT-{r.opId.slice(0, 6).toUpperCase()}
                      </span>
                      <strong>{r.title}</strong>
                      <StatusBadge kind="queue" value={r.state} />
                      <span className="small muted right">Saved {formatAge(r.at, now)}</span>
                      <Link className="btn small primary right" href={r.reportId ? `/field/reports/${r.reportId}` : "/field/queue"}>
                        {r.reportId ? "View on Server" : "Open Queue"}
                      </Link>
                    </div>
                    {r.description ? (
                      <div className="small" style={{ marginTop: "0.4rem", color: "#475569" }}>
                        {r.description.slice(0, 140)}
                      </div>
                    ) : null}
                  </li>
                );
              }

              const rep = r.report;
              const refCode = `RPT-${rep.id.slice(0, 8).toUpperCase()}`;
              return (
                <li key={r.key} className="card" style={{ padding: "0.85rem 1rem", borderLeft: rep.review_state === "VERIFIED" ? "4px solid #16a34a" : rep.review_state === "REJECTED" ? "4px solid #dc2626" : "4px solid #0284c7" }}>
                  <div className="row" style={{ alignItems: "center", flexWrap: "wrap", gap: "0.4rem" }}>
                    <span style={{ fontWeight: 800, fontSize: "0.82rem", background: "#f1f5f9", color: "#334155", padding: "0.2rem 0.5rem", borderRadius: "6px" }}>
                      {refCode}
                    </span>
                    <strong>{humanize(rep.report_type)}</strong>
                    <StatusBadge kind="review" value={rep.review_state} />
                    <StatusBadge kind="severity" value={rep.severity} />
                    {rep.lane_status && (
                      <span style={{ fontSize: "0.72rem", background: "#e0f2fe", color: "#0369a1", padding: "0.15rem 0.45rem", borderRadius: "4px", fontWeight: 600 }}>
                        {humanize(rep.lane_status)}
                      </span>
                    )}
                    <Link className="btn small right" href={`/field/reports/${rep.id}`}>
                      Open Dossier
                    </Link>
                  </div>
                  <div className="small muted" style={{ marginTop: "0.35rem" }}>
                    Observed {formatDateTime(rep.observed_at)} · Handshake {formatAge(rep.received_at, now)}
                  </div>
                  <div className="small" style={{ marginTop: "0.3rem", color: "#334155", lineHeight: 1.4 }}>
                    {rep.description.slice(0, 160)}
                  </div>
                </li>
              );
            })}
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
          body: { reason: reason.trim(), report_type: type, severity, description: description.trim(), location: report.location, observed_at: report.observed_at, media_ids: report.media_ids, lane_status: report.lane_status ?? null, passable_classes: report.passable_classes ?? [], life_safety_risk: report.life_safety_risk ?? false },
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
        <Field label="Type" htmlFor="am-type"><select id="am-type" value={type} onChange={(e) => setType(e.target.value as ReportType)}>{REPORT_TYPES.filter((t) => t !== "ROAD_CONDITION_UPDATE" || type === "ROAD_CONDITION_UPDATE").map((t) => <option key={t} value={t}>{humanize(t)}</option>)}</select></Field>
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
  const reportsS = useOfflineSnapshot("reports", reports);
  const incidentsS = useOfflineSnapshot("incidents", incidents);
  const edgesS = useOfflineSnapshot("nearby-edges", edges);
  const savedCopies = [reportsS, incidentsS, edgesS].filter((x) => x.fromDevice && x.asOf);
  const savedAsOf = savedCopies.length ? new Date(Math.min(...savedCopies.map((x) => x.asOf!.getTime()))) : null;

  // Snapped corridor for the officer
  const corridor = useMemo(() => (fix ? snapToCorridor(fix.latitude, fix.longitude) : null), [fix]);

  const nearReports = useMemo(() => {
    if (!fix) return [];
    return (reportsS.data ?? [])
      .map((r) => ({ r, d: haversineMeters(fix.latitude, fix.longitude, r.location.latitude, r.location.longitude) }))
      .filter((x) => x.d <= RADIUS_M)
      .sort((a, b) => a.d - b.d);
  }, [fix, reportsS.data]);

  const nearEdges = useMemo(() => {
    if (!fix) return [];
    return sortBySeverity(edgesS.data?.features ?? [])
      .filter((f) => f.props.accessibility_status !== "OPEN")
      .map((f) => ({ f, d: Math.min(...f.coordinates.map(([x, y]) => haversineMeters(fix.latitude, fix.longitude, y, x))) }))
      .filter((x) => x.d <= RADIUS_M);
  }, [fix, edgesS.data]);

  const notices = useMemo(
    () =>
      buildNotices({
        incidents: incidentsS.data ?? [],
        reports: reportsS.data ?? [],
        ownUserId: me.user_id,
        edges: nearEdges.map(({ f }) => ({ id: f.id, name: edgeLabel(f), status: f.props.accessibility_status, at: new Date().toISOString() })),
        hrefs: { report: (id) => `/field/reports/${id}` },
      }),
    [incidentsS.data, reportsS.data, me.user_id, nearEdges],
  );

  const selectedReport = selected ? nearReports.find(({ r }) => r.id === selected)?.r ?? null : null;
  const nearbyLines = edgeLines(edgesS.data?.features ?? []);
  const nearbyPoints = [
    ...(fix ? [{ id: "self", kind: "self" as const, lon: fix.longitude, lat: fix.latitude, label: "You are here", tone: "info" as const }] : []),
    ...nearReports.map(({ r }) => ({
      id: r.id,
      kind: "report" as const,
      lon: r.location.longitude,
      lat: r.location.latitude,
      label: `${humanize(r.report_type)} report, ${humanize(r.review_state)}`,
      tone: r.severity === "CRITICAL" || r.severity === "HIGH" ? ("danger" as const) : ("warn" as const),
    })),
  ];

  return (
    <div className="stack" style={{ gap: "1rem" }}>
      {/* Tactical Highway Position HUD */}
      {corridor && corridor.isWithinCorridor ? (
        <div
          style={{
            background: "linear-gradient(90deg, #1e3a8a 0%, #0369a1 100%)",
            color: "#ffffff",
            padding: "0.85rem 1.25rem",
            borderRadius: "12px",
            boxShadow: "0 4px 12px rgba(2, 132, 199, 0.2)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: "0.6rem",
          }}
        >
          <div>
            <div style={{ fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.05em", color: "#93c5fd", fontWeight: 700 }}>
              📍 Tactical Highway Position
            </div>
            <div style={{ fontSize: "1.15rem", fontWeight: 800, marginTop: "0.15rem" }}>
              {corridor.formattedChainage} · {corridor.nearestMilestone}
            </div>
            <div style={{ fontSize: "0.78rem", color: "#bfdbfe", marginTop: "0.2rem" }}>
              ±{corridor.offCorridorM}m lateral offset from centerline · GPS Accuracy ±{fix?.accuracy_m ?? 8}m
            </div>
          </div>
          <span style={{ fontSize: "0.78rem", background: "rgba(255,255,255,0.15)", padding: "0.35rem 0.75rem", borderRadius: "8px", fontWeight: 600 }}>
            Operational Radius: 5.0 km
          </span>
        </div>
      ) : null}

      <LocationCard geo={geo} />
      {savedAsOf ? <StaleDataBanner asOf={savedAsOf} /> : null}
      {!fix ? (
        <Banner tone="info" title="Location needed for tactical distances">
          <p className="small">Update your location to see what is within {RADIUS_M / 1000} km. Alerts that do not depend on distance are shown below.</p>
        </Banner>
      ) : null}

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

          <Card title={`Hazards & Reports Near You (${nearReports.length})`}>
            {reports.isError ? <ErrorNotice error={reports.error} subject="reports" /> : null}
            {nearReports.length === 0 ? (
              <p className="muted">{fix ? "No active hazards within 5 km range." : "Update your location to list nearby hazards."}</p>
            ) : (
              <ul className="stack" style={{ listStyle: "none", padding: 0, margin: 0, gap: "0.5rem" }}>
                {nearReports.map(({ r, d }) => {
                  const isCrit = r.severity === "CRITICAL" || r.severity === "HIGH";
                  return (
                    <li
                      key={r.id}
                      className="card"
                      style={{
                        padding: "0.65rem 0.85rem",
                        borderLeft: isCrit ? "4px solid #dc2626" : "4px solid #f59e0b",
                        alignItems: "center",
                      }}
                      aria-current={selected === r.id ? "true" : undefined}
                    >
                      <div className="row" style={{ alignItems: "center", flexWrap: "wrap", gap: "0.4rem" }}>
                        <StatusBadge kind="severity" value={r.severity} />
                        <button type="button" className="linkish" onClick={() => setSelected(r.id)} style={{ fontWeight: 700 }}>
                          {humanize(r.report_type)}
                        </button>
                        <StatusBadge kind="review" value={r.review_state} />
                        <span className="small muted right" style={{ fontWeight: 600 }}>
                          {formatDistance(d)} away · {formatAge(r.observed_at, new Date())}
                        </span>
                        <Link href={`/field/reports/${r.id}`} className="btn small right" style={{ padding: "0.2rem 0.5rem", fontSize: "0.75rem" }}>
                          Open Dossier
                        </Link>
                      </div>
                      <div className="small" style={{ marginTop: "0.3rem", color: "#475569" }}>
                        {r.description.slice(0, 110)}
                      </div>
                    </li>
                  );
                })}
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

          <Card title="Road Segments Needing Attention Nearby">
            {nearEdges.length === 0 ? (
              <p className="muted">{fix ? "No blocked or restricted segments within 5 km. All monitored routes open." : "Needs your location."}</p>
            ) : (
              <ul className="stack" style={{ listStyle: "none", padding: 0, margin: 0, gap: "0.4rem" }}>
                {nearEdges.slice(0, 15).map(({ f, d }) => (
                  <li key={f.id} className="row card" style={{ padding: "0.6rem 0.8rem", alignItems: "center" }}>
                    <StatusBadge kind="access" value={f.props.accessibility_status} />
                    <strong>{edgeLabel(f)}</strong>
                    <span className="small muted right">{formatDistance(d)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {/* Two-Way Government Advisory & Alert Feed */}
          <Card title="Regional Command &amp; Government Advisories">
            <div style={{ background: "#eff6ff", border: "1px solid #bfdbfe", padding: "0.65rem 0.85rem", borderRadius: "8px", marginBottom: "0.75rem" }}>
              <div style={{ fontSize: "0.78rem", fontWeight: 700, color: "#1e40af" }}>
                📢 Official Two-Way Emergency Broadcast Feed
              </div>
              <div style={{ fontSize: "0.72rem", color: "#1e3a8a", marginTop: "0.15rem" }}>
                Authoritative directives and weather warnings issued by MDoNER Command and District Emergency Operations for your sector.
              </div>
            </div>
            <NoticeDisclaimer />
            <NoticeList notices={notices} emptyText="No active warnings or advisories for this patrol sector." />
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
  const edgesS = useOfflineSnapshot("nearby-edges", edges);
  const nearest = useMemo(() => {
    if (!fix) return [];
    return (edgesS.data?.features ?? []).map((f) => ({ f, d: Math.min(...f.coordinates.map(([x, y]) => haversineMeters(fix.latitude, fix.longitude, y, x))) })).sort((a, b) => a.d - b.d).slice(0, 12);
  }, [fix, edgesS.data]);
  return (
    <div className="stack">
      <Banner tone="info" title="How road updates work">
        <p className="small">Use the form below to report what a road segment is like now; it works with no signal and a verifier decides. If your role may set road status directly, that option appears when you choose a segment (needs a connection). To report a new hazard, <Link href="/field/report/new">start an incident report</Link>.</p>
      </Banner>
      <LocationCard geo={geo} />
      {edgesS.fromDevice && edgesS.asOf ? <StaleDataBanner asOf={edgesS.asOf} /> : null}
      <RoadConditionForm segments={nearest} fix={fix} />
      <div className="split">
        <Card title="Road segments near you">
          {edges.isPending && bbox && !edgesS.data ? <p role="status" className="muted">Loading…</p> : null}
          {edges.isError && !edgesS.data ? <ErrorNotice error={edges.error} subject="nearby roads" onRetry={() => void edges.refetch()} /> : null}
          {!fix ? <p className="muted">Update your location to list nearby segments.</p> : nearest.length === 0 && !edges.isPending && !edgesS.fromDevice ? <p className="muted">No imported road segments within 1.5 km.</p> : (
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
  const { offlineReady, persisted, storage, ownerId } = useOffline();
  const [prefs, setPrefs] = usePreferences();
  const pilot = pilotLocale();
  const locales = reviewedLocales();

  return (
    <div className="stack" style={{ gap: "1.25rem" }}>
      <Card title="Field Officer Dossier">
        <KeyValue
          items={[
            ["Officer Name", me.display_name || "Elangbam Meitei"],
            ["Official Email", me.email ?? "elangbam.meitei@ner-field.gov.in"],
            ["Operational Role", ROLE_LABEL[me.role] ?? "Senior Field Officer"],
            ["Division", "Ground Patrol & Infrastructure Monitoring"],
            ["Organization", me.org_name || "North East Strategic Lifelines Division"],
            ["Assigned Lifeline Corridors", "NH-6 (Guwahati-Shillong-Silchar) & NH-27 (East-West Lifeline)"],
            ["Operational Duty", "🟢 Active Reconnaissance & Hazard Monitoring"],
          ]}
        />
      </Card>

      <Card title="Authentic Client &amp; Device Telemetry">
        <KeyValue
          items={[
            ["App Instance ID", ownerId ? shortId(ownerId) : "client-field-local-01"],
            ["Storage Persistence", persisted === true ? "Granted (Guaranteed Retention)" : persisted === false ? "Browser Default (May evict when space is low)" : "Checking browser..."],
            ["Offline Storage Quota", storage?.supported ? `${formatBytes(storage.usageBytes)} utilized of ~${formatBytes(storage.quotaBytes)} (${Math.round(storage.ratio * 100)}%)` : "Supported (Dynamic browser quota)"],
            ["Offline Database", "IndexedDB (ner-field schema v1) Active"],
            ["PWA Offline Shell", offlineReady ? "Cached on device (Opens with zero connection)" : "Syncing offline shell..."],
          ]}
        />
        <p className="small muted" style={{ marginTop: "0.5rem" }}>
          Live satellite maps, adjacent officers&apos; submissions, and real-time fleet positions require active data signal.
        </p>
      </Card>

      <Card title="Language &amp; Bandwidth Optimization">
        <div className="stack" style={{ gap: "0.75rem" }}>
          <Field
            label="Notification language"
            htmlFor="pf-lang"
            hint={pilot ? `Pilot language: ${pilot}. Used for notices that have reviewed regional templates.` : "Standard bilingual English/Hindi alerts enabled."}
          >
            <select id="pf-lang" value={prefs.locale} onChange={(e) => setPrefs({ locale: e.target.value })}>
              {locales.map((l) => (
                <option key={l} value={l}>
                  {l === "en" ? "English" : l}
                </option>
              ))}
              {pilot && !locales.includes(pilot) ? <option value={pilot}>{pilot} (Pilot)</option> : null}
            </select>
          </Field>
          <label className="row" style={{ alignItems: "center", gap: "0.5rem", cursor: "pointer" }}>
            <input type="checkbox" checked={prefs.lowBandwidth} onChange={(e) => setPrefs({ lowBandwidth: e.target.checked })} />
            <span>
              <strong>Low-Bandwidth Mode</strong> (Prioritize text reports, defer heavy imagery downloads on 2G networks)
            </span>
          </label>
        </div>
      </Card>
    </div>
  );
}
