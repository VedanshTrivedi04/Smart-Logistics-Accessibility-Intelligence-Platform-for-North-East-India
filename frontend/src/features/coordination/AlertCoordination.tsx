"use client";

import { useState, type FormEvent } from "react";
import { useSession } from "@/shared/auth";
import { formatAge } from "@/shared/lib/time";
import { Button, ErrorNotice, useAnnounce } from "@/shared/ui";
import { useCoordinationSummaries, useJurisdictionIndex, useRecordCoordinationAction } from "./queries";

const MIN_NOTE = 5;

/**
 * Acknowledge or escalate one alert. Alerts are computed from records, so the alert id is the
 * subject; the record shows who has seen it and which authority it went to, and notifies no one.
 */
export function AlertCoordination({ alertId }: { alertId: string }) {
  const { can } = useSession();
  const index = useJurisdictionIndex();
  const summaries = useCoordinationSummaries("ALERT");
  const record = useRecordCoordinationAction();
  const announce = useAnnounce();
  const [open, setOpen] = useState(false);
  const [target, setTarget] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);

  if (!can("COORDINATE_RESPONSE")) return null;
  const summary = summaries.data?.find((s) => s.subject_ref === alertId);

  const acknowledge = () => record.mutate({ subject_type: "ALERT", subject_ref: alertId, action: "ACKNOWLEDGE" }, { onSuccess: () => announce("Alert acknowledged") });
  const escalate = (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!target) return setError("Choose the authority to escalate to.");
    if (notes.trim().length < MIN_NOTE) return setError(`Add a note of at least ${MIN_NOTE} characters.`);
    record.mutate(
      { subject_type: "ALERT", subject_ref: alertId, action: "ESCALATE", target_jurisdiction_id: target, notes: notes.trim() },
      { onSuccess: () => { announce("Alert escalated"); setOpen(false); setTarget(""); setNotes(""); } },
    );
  };

  return (
    <div className="stack" style={{ marginTop: "0.4rem" }}>
      <div className="row">
        {summary?.acknowledged && summary.acknowledged_at ? <span className="badge tone-ok">Acknowledged {formatAge(summary.acknowledged_at)}</span> : null}
        {summary?.escalated_to_jurisdiction_id ? <span className="badge tone-warn">Escalated to {index.name(summary.escalated_to_jurisdiction_id)}</span> : null}
        {!summary?.acknowledged ? <Button size="small" onClick={acknowledge} busy={record.isPending && !open}>Acknowledge</Button> : null}
        <Button size="small" onClick={() => setOpen((v) => !v)} aria-expanded={open}>{open ? "Cancel" : "Escalate"}</Button>
      </div>
      {open ? (
        <form className="stack" onSubmit={escalate} aria-label="Escalate alert">
          <label className="sr-only" htmlFor={`esc-target-${alertId}`}>Authority</label>
          <select id={`esc-target-${alertId}`} value={target} onChange={(e) => setTarget(e.target.value)}>
            <option value="">Select an authority</option>
            <optgroup label="States">{index.states.map((j) => <option key={j.id} value={j.id}>{j.name}</option>)}</optgroup>
            {index.all.some((j) => j.level === "DISTRICT") ? <optgroup label="Districts">{index.all.filter((j) => j.level === "DISTRICT").map((j) => <option key={j.id} value={j.id}>{j.name}</option>)}</optgroup> : null}
          </select>
          <label className="sr-only" htmlFor={`esc-notes-${alertId}`}>Note</label>
          <textarea id={`esc-notes-${alertId}`} placeholder="Why this needs their attention (required)" value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={2000} />
          {error ? <span className="error" role="alert">{error}</span> : null}
          <Button type="submit" variant="primary" size="small" busy={record.isPending}>Record escalation</Button>
        </form>
      ) : null}
      {record.isError ? <ErrorNotice error={record.error} subject="this action" /> : null}
    </div>
  );
}
