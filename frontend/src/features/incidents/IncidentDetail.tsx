"use client";

import Link from "next/link";
import { useMemo, useState, type FormEvent } from "react";
import { RESOLUTION_REASONS, type ResolutionReason } from "@/shared/api";
import { useSession } from "@/shared/auth";
import { humanize } from "@/shared/lib/format";
import { bboxAround } from "@/shared/lib/geo";
import { formatDateTime } from "@/shared/lib/time";
import { MapLegend, MapView } from "@/shared/map";
import { Banner, Button, Card, ErrorNotice, Field, KeyValue, QueryState, StatusBadge, useAnnounce } from "@/shared/ui";
import { edgeLabel, edgeLines, sortBySeverity, useEdges } from "@/features/network";
import { ReportEvidence } from "./evidence";
import { CoordinationPanel } from "@/features/coordination";
import { IncidentImpact } from "./IncidentImpact";
import { useIncident, useIncidents, useMergeIncident, useReport, useResolveIncident } from "./queries";

function ResolveForm({ incidentId, lat, lon }: { incidentId: string; lat: number | null; lon: number | null }) {
  const resolve = useResolveIncident();
  const announce = useAnnounce();
  const bbox = useMemo(() => (lat !== null && lon !== null ? bboxAround(lat, lon, 600) : null), [lat, lon]);
  const nearby = useEdges(bbox, 15, Boolean(bbox));
  const affected = useMemo(() => sortBySeverity(nearby.data?.features ?? []).filter((f) => f.props.accessibility_status !== "OPEN").slice(0, 20), [nearby.data]);
  const [reason, setReason] = useState<ResolutionReason>("HAZARD_CLEARED");
  const [notes, setNotes] = useState("");
  const [edges, setEdges] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (notes.trim().length < 10) return setError("Explain what changed. At least 10 characters; it is kept in the audit trail.");
    resolve.mutate({ incidentId, reason, notes: notes.trim(), affectedEdgeIds: edges }, { onSuccess: () => announce("Incident resolved") });
  };

  return (
    <form className="stack" onSubmit={submit} aria-label="Resolve incident">
      <h3>Resolve incident</h3>
      <p className="small muted">Resolving may change road status. Roads are only reopened for segments you select here, and the server decides whether your role is allowed to reopen them.</p>
      <Field label="Resolution reason" htmlFor="res-reason">
        <select id="res-reason" value={reason} onChange={(e) => setReason(e.target.value as ResolutionReason)}>
          {RESOLUTION_REASONS.map((r) => <option key={r} value={r}>{humanize(r)}</option>)}
        </select>
      </Field>
      {affected.length ? (
        <fieldset>
          <legend>Segments to recalculate</legend>
          {affected.map((f) => (
            <label key={f.id} className="row">
              <input type="checkbox" checked={edges.includes(f.id)} onChange={(e) => setEdges((cur) => (e.target.checked ? [...cur, f.id] : cur.filter((x) => x !== f.id)))} />
              {edgeLabel(f)} <StatusBadge kind="access" value={f.props.accessibility_status} />
            </label>
          ))}
        </fieldset>
      ) : (
        <p className="small muted">No non-open segments near the report location.</p>
      )}
      <Field label="Notes (required)" htmlFor="res-notes" error={error}>
        <textarea id="res-notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
      </Field>
      {resolve.isError ? <ErrorNotice error={resolve.error} subject="this resolution" /> : null}
      {resolve.isSuccess ? <Banner tone="ok" title="Resolution recorded by the server" /> : null}
      <Button type="submit" variant="primary" busy={resolve.isPending} disabled={resolve.isSuccess}>Resolve incident</Button>
    </form>
  );
}

function MergeForm({ incidentId }: { incidentId: string }) {
  const merge = useMergeIncident();
  const others = useIncidents("ACTIVE");
  const [target, setTarget] = useState("");
  const [notes, setNotes] = useState("");
  const options = (others.data ?? []).filter((i) => i.id !== incidentId);
  return (
    <form className="stack" aria-label="Merge duplicate incident" onSubmit={(e) => { e.preventDefault(); if (target) merge.mutate({ incidentId, targetId: target, ...(notes ? { notes } : {}) }); }}>
      <h3>Merge duplicate</h3>
      <Field label="Merge into" htmlFor="mg-target">
        <select id="mg-target" value={target} onChange={(e) => setTarget(e.target.value)}>
          <option value="">Select the primary incident</option>
          {options.map((i) => <option key={i.id} value={i.id}>{i.title}</option>)}
        </select>
      </Field>
      <Field label="Notes (optional)" htmlFor="mg-notes"><input id="mg-notes" value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
      {merge.isError ? <ErrorNotice error={merge.error} subject="this merge" /> : null}
      {merge.isSuccess ? <Banner tone="ok" title="Merge recorded by the server" /> : null}
      <Button type="submit" busy={merge.isPending} disabled={!target || merge.isSuccess}>Merge</Button>
    </form>
  );
}

export function IncidentDetail({ incidentId, reportsBase = "/gov/reports" }: { incidentId: string; reportsBase?: string }) {
  const { can } = useSession();
  const incident = useIncident(incidentId);
  const report = useReport(incident.data?.primary_report_id ?? null);
  const bbox = useMemo(() => (report.data ? bboxAround(report.data.location.latitude, report.data.location.longitude, 800) : null), [report.data]);
  const nearby = useEdges(bbox, 14, Boolean(bbox));
  const canDetail = can("VIEW_REPORT_DETAIL");

  return (
    <QueryState query={incident} subject="incident">
      {(i) => {
        const incidentLines = edgeLines(nearby.data?.features ?? []);
        const incidentPoints = report.data ? [{ id: i.id, kind: "incident" as const, lon: report.data.location.longitude, lat: report.data.location.latitude, label: `Incident: ${i.title}`, tone: "danger" as const }] : [];
        return (
        <div className="split">
          <div className="stack">
            <Card title={i.title || "Incident"}>
              <div className="stack">
                <div className="row"><StatusBadge kind="severity" value={i.severity} /><StatusBadge kind="lifecycle" value={i.lifecycle} /></div>
                <p>{i.description}</p>
                <KeyValue
                  items={[
                    ["Created", formatDateTime(i.created_at)],
                    ["Version", String(i.version)],
                    ["Verification", report.data ? humanize(report.data.review_state) : canDetail ? "…" : "Verified (incident exists)"],
                    ["Primary report", <Link key="p" href={`${reportsBase}/${i.primary_report_id}`}>Open report</Link>],
                    ["Resolved", i.resolved_at ? `${formatDateTime(i.resolved_at)} — ${humanize(i.resolution_reason)}` : "Not resolved"],
                    ["Resolution notes", i.resolution_notes ?? "—"],
                    ["Reopened", i.reopened_at ? `${formatDateTime(i.reopened_at)} — ${i.reopened_reason ?? ""}` : "Never"],
                  ]}
                />
              </div>
            </Card>
            {canDetail ? (
              <QueryState query={report} subject="primary report">{(r) => <ReportEvidence report={r} />}</QueryState>
            ) : (
              <Banner tone="neutral" title="Report detail not available"><p className="small">Your role can see this incident summary but not the underlying report evidence.</p></Banner>
            )}
            <IncidentImpact incidentId={i.id} />
            <CoordinationPanel subjectType="INCIDENT" subjectRef={i.id} inspectable />
          </div>
          <div className="stack">
            {report.data ? (
              <Card title="Location and nearby roads">
                <MapView
                  ariaLabel="Incident location"
                  height={300}
                  lines={incidentLines}
                  points={incidentPoints}
                  fitBounds={bbox}
                  fitKey={i.id}
                />
                <MapLegend lines={incidentLines} points={incidentPoints} />
              </Card>
            ) : null}
            {can("VERIFY_REPORT") && i.lifecycle !== "RESOLVED" ? (
              <>
                <Card><ResolveForm incidentId={i.id} lat={report.data?.location.latitude ?? null} lon={report.data?.location.longitude ?? null} /></Card>
                <Card><MergeForm incidentId={i.id} /></Card>
              </>
            ) : null}
          </div>
        </div>
        );
      }}
    </QueryState>
  );
}
