"use client";

import { useState, type FormEvent } from "react";
import type { CoordinationActionType, CoordinationSubjectType, CoordinationSummary } from "@/shared/api";
import { useSession } from "@/shared/auth";
import { humanize } from "@/shared/lib/format";
import { formatAge, formatDateTime } from "@/shared/lib/time";
import { Banner, Button, Card, ErrorNotice, Field, KeyValue, useAnnounce } from "@/shared/ui";
import { useCoordinationSummaries, useJurisdictionIndex, useRecordCoordinationAction, type JurisdictionIndex } from "./queries";

const LABEL: Record<CoordinationActionType, string> = {
  ACKNOWLEDGE: "Acknowledge",
  ESCALATE: "Escalate to an authority",
  ASSIGN: "Assign to an authority",
  REQUEST_INSPECTION: "Request road inspection",
  INSPECTION_COMPLETE: "Mark inspection complete",
  NOTE: "Add a note",
};

const NEEDS_TARGET: readonly CoordinationActionType[] = ["ESCALATE", "ASSIGN"];
const NEEDS_NOTE: readonly CoordinationActionType[] = ["ESCALATE", "NOTE"];
const MIN_NOTE = 5;

/** Actions that make sense given the current state; the server enforces the same rules. */
export function availableActions(summary: CoordinationSummary | undefined, inspectable: boolean): CoordinationActionType[] {
  const out: CoordinationActionType[] = [];
  if (!summary?.acknowledged) out.push("ACKNOWLEDGE");
  out.push("ESCALATE", "ASSIGN");
  if (inspectable) {
    if (summary?.inspection_status === "REQUESTED") out.push("INSPECTION_COMPLETE");
    else out.push("REQUEST_INSPECTION");
  }
  out.push("NOTE");
  return out;
}

export function inspectionLabel(status: CoordinationSummary["inspection_status"] | undefined): string {
  return status === "REQUESTED" ? "Pending" : status === "COMPLETED" ? "Completed" : "Not requested";
}

function TargetSelect({ id, value, onChange, index }: { id: string; value: string; onChange: (v: string) => void; index: JurisdictionIndex }) {
  const states = index.states;
  const districts = index.all.filter((j) => j.level === "DISTRICT");
  return (
    <select id={id} value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">Select an authority</option>
      <optgroup label="States">{states.map((j) => <option key={j.id} value={j.id}>{j.name}</option>)}</optgroup>
      {districts.length ? <optgroup label="Districts">{districts.map((j) => <option key={j.id} value={j.id}>{j.name}</option>)}</optgroup> : null}
    </select>
  );
}

/**
 * Coordination log for one incident or facility: who has acknowledged it, which authority it was
 * escalated or assigned to, and where the road inspection stands. Recording an action notifies no
 * one and changes no road, trip or incident; it is a shared record for people to coordinate against.
 */
export function CoordinationPanel({ subjectType, subjectRef, inspectable = false }: { subjectType: CoordinationSubjectType; subjectRef: string; inspectable?: boolean }) {
  const { can } = useSession();
  const index = useJurisdictionIndex();
  const summaries = useCoordinationSummaries(subjectType, subjectRef);
  const record = useRecordCoordinationAction();
  const announce = useAnnounce();
  const summary = summaries.data?.find((s) => s.subject_ref === subjectRef && s.subject_type === subjectType);
  const actions = availableActions(summary, inspectable);

  const [action, setAction] = useState<CoordinationActionType>("ACKNOWLEDGE");
  const [target, setTarget] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const selected = actions.includes(action) ? action : (actions[0] as CoordinationActionType);

  if (!can("COORDINATE_RESPONSE")) return null;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (NEEDS_TARGET.includes(selected) && !target) return setError("Choose the authority this goes to.");
    if (NEEDS_NOTE.includes(selected) && notes.trim().length < MIN_NOTE) return setError(`Add a note of at least ${MIN_NOTE} characters.`);
    record.mutate(
      {
        subject_type: subjectType,
        subject_ref: subjectRef,
        action: selected,
        ...(target && (NEEDS_TARGET.includes(selected) || selected === "REQUEST_INSPECTION") ? { target_jurisdiction_id: target } : {}),
        ...(notes.trim() ? { notes: notes.trim() } : {}),
      },
      {
        onSuccess: () => {
          announce(`${LABEL[selected]} recorded`);
          setTarget("");
          setNotes("");
        },
      },
    );
  };

  return (
    <Card title="Coordination">
      <div className="stack">
        {summaries.isError ? <ErrorNotice error={summaries.error} subject="coordination records" onRetry={() => void summaries.refetch()} /> : null}
        <KeyValue
          items={[
            ["Acknowledged", summary?.acknowledged && summary.acknowledged_at ? formatDateTime(summary.acknowledged_at) : "Not yet"],
            ["Escalated to", summary?.escalated_to_jurisdiction_id ? `${index.name(summary.escalated_to_jurisdiction_id)}${summary.escalated_at ? ` (${formatAge(summary.escalated_at)})` : ""}` : "Not escalated"],
            ["Assigned to", summary?.assigned_jurisdiction_id ? `${index.name(summary.assigned_jurisdiction_id)}${summary.assigned_at ? ` (${formatAge(summary.assigned_at)})` : ""}` : "Not assigned"],
            ...(inspectable ? ([["Road inspection", inspectionLabel(summary?.inspection_status)]] as Array<[string, string]>) : []),
          ]}
        />

        <form className="stack" onSubmit={submit} aria-label="Record a coordination action">
          <Field label="Action" htmlFor={`co-action-${subjectRef}`}>
            <select id={`co-action-${subjectRef}`} value={selected} onChange={(e) => { setAction(e.target.value as CoordinationActionType); setError(null); }}>
              {actions.map((a) => <option key={a} value={a}>{LABEL[a]}</option>)}
            </select>
          </Field>
          {NEEDS_TARGET.includes(selected) || selected === "REQUEST_INSPECTION" ? (
            <Field label={selected === "REQUEST_INSPECTION" ? "Inspecting authority (optional)" : "Authority"} htmlFor={`co-target-${subjectRef}`}>
              <TargetSelect id={`co-target-${subjectRef}`} value={target} onChange={setTarget} index={index} />
            </Field>
          ) : null}
          <Field label={NEEDS_NOTE.includes(selected) ? "Note (required)" : "Note (optional)"} htmlFor={`co-notes-${subjectRef}`} error={error}>
            <textarea id={`co-notes-${subjectRef}`} value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={2000} />
          </Field>
          {record.isError ? <ErrorNotice error={record.error} subject="this action" /> : null}
          <Button type="submit" variant="primary" busy={record.isPending}>{LABEL[selected]}</Button>
          <p className="small muted">This records the action for other authorities to see. It does not send a notification or change any road, trip or incident.</p>
        </form>

        {summary && summary.actions.length ? (
          <div>
            <h3>History</h3>
            <ul className="stack" style={{ listStyle: "none", padding: 0, margin: 0 }}>
              {[...summary.actions].reverse().map((a) => (
                <li key={a.id} className="small">
                  <strong>{LABEL[a.action]}</strong>
                  {a.target_jurisdiction_id ? ` → ${index.name(a.target_jurisdiction_id)}` : ""} · {humanize(a.actor_role)} · {formatDateTime(a.created_at)}
                  {a.notes ? <div className="muted">{a.notes}</div> : null}
                </li>
              ))}
            </ul>
          </div>
        ) : summaries.isPending ? null : <Banner tone="neutral" title="No coordination recorded yet" />}
      </div>
    </Card>
  );
}
