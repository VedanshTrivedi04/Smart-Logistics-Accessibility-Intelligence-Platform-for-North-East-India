"use client";

import Link from "next/link";
import { useMemo, useState, type FormEvent } from "react";
import { REJECTION_REASONS, type RejectionReason } from "@/shared/api";
import { usePrincipal, useSession } from "@/shared/auth";
import { humanize } from "@/shared/lib/format";
import { bboxAround } from "@/shared/lib/geo";
import { MapView } from "@/shared/map";
import { Banner, Button, Card, ErrorNotice, Field, QueryState, StatusBadge, useAnnounce } from "@/shared/ui";
import { edgeLabel, edgeLines, sortBySeverity, useEdges } from "@/features/network";
import { ReportEvidence } from "./evidence";
import { useIncidents, useReport, useReview, useTriage, type ReviewInput } from "./queries";

type Decision = ReviewInput["decision"];

function ReviewForm({ reportId, version, latitude, longitude, reporterId }: { reportId: string; version: number; latitude: number; longitude: number; reporterId: string }) {
  const me = usePrincipal();
  const announce = useAnnounce();
  const review = useReview();
  const incidents = useIncidents("ACTIVE");
  const bbox = useMemo(() => bboxAround(latitude, longitude, 600), [latitude, longitude]);
  const nearby = useEdges(bbox, 15);
  const [decision, setDecision] = useState<Decision>("CONFIRM_INCIDENT");
  const [notes, setNotes] = useState("");
  const [rejection, setRejection] = useState<RejectionReason>("UNVERIFIABLE");
  const [existing, setExisting] = useState("");
  const [title, setTitle] = useState("");
  const [closures, setClosures] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);

  const isOwnReport = reporterId === me.user_id;
  const nearbyEdges = useMemo(() => sortBySeverity(nearby.data?.features ?? []).slice(0, 30), [nearby.data]);
  const selected = Object.keys(closures);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (notes.trim().length < 5 && decision !== "CONFIRM_INCIDENT") return setError("Add notes explaining your decision.");
    if (decision === "CONFIRM_INCIDENT" && !existing && title.trim().length < 5) return setError("Give the new incident a title, or attach this report to an existing incident.");
    review.mutate(
      {
        reportId,
        version,
        decision,
        ...(notes.trim() ? { notes: notes.trim() } : {}),
        ...(decision === "REJECT_REPORT" ? { rejectionReason: rejection } : {}),
        ...(decision === "CONFIRM_INCIDENT" && existing ? { existingIncidentId: existing } : {}),
        ...(decision === "CONFIRM_INCIDENT" && !existing ? { incidentTitle: title.trim() } : {}),
        ...(decision === "CONFIRM_INCIDENT" ? { affectedEdges: selected.map((id) => ({ edge_id: id, is_full_closure: closures[id] ?? true })) } : {}),
      },
      { onSuccess: (r) => announce(`Decision recorded: ${humanize(r.decision)}`) },
    );
  };

  if (isOwnReport) {
    return <Banner tone="neutral" title="You cannot review your own report"><p className="small">Another verifier must decide. This is enforced by the server.</p></Banner>;
  }

  return (
    <form className="stack" onSubmit={submit} aria-label="Review decision">
      <h3>Decision</h3>
      <fieldset>
        <legend>What is your decision?</legend>
        <div className="choice-grid">
          {([
            ["CONFIRM_INCIDENT", "Verify — confirm an incident"],
            ["REQUEST_MORE_INFO", "Request more information"],
            ["REJECT_REPORT", "Reject the report"],
          ] as const).map(([v, label]) => (
            <label key={v} className="choice">
              <input type="radio" name="decision" value={v} checked={decision === v} onChange={() => setDecision(v)} />
              {label}
            </label>
          ))}
        </div>
      </fieldset>

      {decision === "REJECT_REPORT" ? (
        <Field label="Rejection reason" htmlFor="rj-reason">
          <select id="rj-reason" value={rejection} onChange={(e) => setRejection(e.target.value as RejectionReason)}>
            {REJECTION_REASONS.map((r) => <option key={r} value={r}>{humanize(r)}</option>)}
          </select>
        </Field>
      ) : null}

      {decision === "CONFIRM_INCIDENT" ? (
        <>
          <Field label="Attach to an existing active incident (optional)" htmlFor="rv-existing">
            <select id="rv-existing" value={existing} onChange={(e) => setExisting(e.target.value)}>
              <option value="">Create a new incident</option>
              {(incidents.data ?? []).map((i) => <option key={i.id} value={i.id}>{i.title}</option>)}
            </select>
          </Field>
          {!existing ? (
            <Field label="New incident title" htmlFor="rv-title">
              <input id="rv-title" value={title} onChange={(e) => setTitle(e.target.value)} />
            </Field>
          ) : null}
          <fieldset>
            <legend>Road segments affected (within 600 m of the report)</legend>
            {nearby.isPending ? <p role="status" className="muted small">Loading nearby segments…</p> : null}
            {nearby.isError ? <ErrorNotice error={nearby.error} subject="nearby road segments" /> : null}
            {!nearby.isPending && nearbyEdges.length === 0 ? <p className="small muted">No imported road segments near this location. The incident can be verified without changing any road status; road status is not inferred.</p> : null}
            <ul className="stack" style={{ listStyle: "none", padding: 0, margin: 0 }}>
              {nearbyEdges.map((f) => (
                <li key={f.id} className="row">
                  <label className="row">
                    <input type="checkbox" checked={f.id in closures} onChange={(e) => setClosures((c) => { const n = { ...c }; if (e.target.checked) n[f.id] = true; else delete n[f.id]; return n; })} />
                    <span>{edgeLabel(f)}</span>
                  </label>
                  <StatusBadge kind="access" value={f.props.accessibility_status} />
                  {f.id in closures ? (
                    <label className="row small">
                      <input type="checkbox" checked={closures[f.id] ?? true} onChange={(e) => setClosures((c) => ({ ...c, [f.id]: e.target.checked }))} />
                      Full closure (otherwise restricted)
                    </label>
                  ) : null}
                </li>
              ))}
            </ul>
          </fieldset>
        </>
      ) : null}

      <Field label={decision === "CONFIRM_INCIDENT" ? "Notes (optional)" : "Notes (required)"} htmlFor="rv-notes" error={error}>
        <textarea id="rv-notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
      </Field>

      {review.isError ? <ErrorNotice error={review.error} subject="this decision" /> : null}
      {review.isSuccess ? (
        <Banner tone="ok" title={`Recorded by the server: ${humanize(review.data.decision)}`}>
          <p className="small">Report is now {humanize(review.data.review_state)} (version {review.data.version}).{review.data.incident_id ? <> <Link href={`/gov/incidents/${review.data.incident_id}`}>Open incident</Link></> : null}</p>
        </Banner>
      ) : null}
      <p className="small muted">This decision is sent against record version {version}. If someone else decides first, the server rejects yours and you review their result instead of overwriting it.</p>
      <Button type="submit" variant="primary" busy={review.isPending} disabled={review.isSuccess}>Record decision</Button>
    </form>
  );
}

export function ReportReview({ reportId, incidentsBase = "/gov/incidents" }: { reportId: string; incidentsBase?: string }) {
  const { can } = useSession();
  const query = useReport(reportId);
  const triage = useTriage();
  const announce = useAnnounce();
  const bbox = useMemo(() => (query.data ? bboxAround(query.data.location.latitude, query.data.location.longitude, 600) : null), [query.data]);
  const nearby = useEdges(bbox, 15, Boolean(bbox));

  return (
    <QueryState query={query} subject="report">
      {(r) => (
        <div className="split">
          <div className="stack">
            <ReportEvidence report={r} />
            <Card title="Location">
              <MapView
                ariaLabel="Report location"
                height={300}
                lines={edgeLines(nearby.data?.features ?? [])}
                points={[{ id: r.id, kind: "report", lon: r.location.longitude, lat: r.location.latitude, label: `${humanize(r.report_type)} report location`, tone: "warn" }]}
                fitBounds={bbox}
                fitKey={r.id}
              />
              <p className="small muted">Accuracy ±{Math.round(r.location.accuracy_m)} m. {r.candidate_edge_id ? "Reporter suggested a road segment." : "Reporter did not link a road segment."}</p>
            </Card>
          </div>
          <div className="stack">
            {r.review_state === "VERIFIED" || r.review_state === "REJECTED" ? (
              <Banner tone="info" title={`Already ${humanize(r.review_state).toLowerCase()}`}><p className="small">Further changes go through incident resolution or an amended report.</p></Banner>
            ) : !can("VERIFY_REPORT") ? (
              <Banner tone="neutral" title="View only"><p className="small">Your role can view this report but not verify it.</p></Banner>
            ) : (
              <Card title="Review">
                <div className="stack">
                  {r.review_state === "SUBMITTED" || r.review_state === "PROVISIONAL_CAUTION" ? (
                    <div>
                      <Button onClick={() => triage.mutate(reportId, { onSuccess: () => announce("Report claimed for review") })} busy={triage.isPending}>Claim for review</Button>
                      {triage.isError ? <ErrorNotice error={triage.error} subject="this claim" /> : null}
                      <p className="small muted">Claiming marks the report Under review so others do not duplicate the work.</p>
                    </div>
                  ) : null}
                  <ReviewForm reportId={r.id} version={r.version} latitude={r.location.latitude} longitude={r.location.longitude} reporterId={r.reporter_id} />
                </div>
              </Card>
            )}
            <p className="small"><Link href={incidentsBase}>Back to incidents</Link></p>
          </div>
        </div>
      )}
    </QueryState>
  );
}
