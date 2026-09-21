"use client";

import type { ReactNode } from "react";
import { formatAge, formatDateTime, secondsUntil, ageSeconds } from "@/shared/lib/time";
import { useNow } from "@/shared/lib/useNow";
import { Banner, Card, KeyValue } from "./primitives";
import { StatusBadge } from "./StatusBadge";

/**
 * Observation time and receipt time are different facts: a report can be observed
 * an hour before it reaches the server. Show both when they matter.
 */
export function SourceAge({ observedAt, receivedAt, subject = "Observed" }: { observedAt?: string | null; receivedAt?: string | null; subject?: string }) {
  const now = useNow();
  if (!observedAt && !receivedAt) return <span className="muted">Time unknown</span>;
  const lag = observedAt && receivedAt ? Math.abs((ageSeconds(observedAt, now) ?? 0) - (ageSeconds(receivedAt, now) ?? 0)) : 0;
  return (
    <span>
      {observedAt ? (
        <span title={formatDateTime(observedAt)}>
          {subject} {formatAge(observedAt, now)}
        </span>
      ) : null}
      {observedAt && receivedAt ? " · " : null}
      {receivedAt ? (
        <span title={formatDateTime(receivedAt)}>received {formatAge(receivedAt, now)}</span>
      ) : null}
      {lag > 300 ? <span className="muted small"> (reached the server {Math.round(lag / 60)} min after it was observed)</span> : null}
    </span>
  );
}

interface CoverageBannerProps {
  /** What the platform actually knows about, e.g. [{label: "facilities", count: 12}]. */
  known: Array<{ label: string; count: number }>;
  /** True when the list may be truncated by a server limit. */
  truncated?: boolean;
  note?: ReactNode;
}

/** Absence of a feature on the map is not evidence that a road is open. Say what is known. */
export function CoverageBanner({ known, truncated, note }: CoverageBannerProps) {
  const summary = known.map((k) => `${k.count} ${k.label}`).join(", ");
  return (
    <Banner tone="info" title="Coverage">
      <p className="small">
        Known in this view: {summary || "nothing loaded"}.{truncated ? " The server limit was reached, so this is a partial view." : ""} Roads, bridges and facilities not imported into the network are not shown; their absence does not mean they are open.
        {note ? <> {note}</> : null}
      </p>
    </Banner>
  );
}

export interface EvidencePanelProps {
  observation: {
    typeLabel: string;
    description: string;
    observedAt: string;
    receivedAt: string;
    location?: { lat: number; lon: number; accuracyM: number; provider: string } | undefined;
  };
  verification: {
    reviewState: string;
    notes?: string | null | undefined;
    rejectionReason?: string | null | undefined;
    version?: number | undefined;
  };
  hazard: { severity: string; provisionalCaution: boolean };
  media?: ReactNode;
}

/** Keeps observation, verification, hazard and freshness visibly distinct. */
export function EvidencePanel({ observation, verification, hazard, media }: EvidencePanelProps) {
  return (
    <Card title="Evidence">
      <div className="stack">
        <section aria-label="Observation">
          <h3>Observation (what was reported)</h3>
          <KeyValue
            items={[
              ["Type", observation.typeLabel],
              ["Description", observation.description || "No description"],
              ["Timing", <SourceAge key="t" observedAt={observation.observedAt} receivedAt={observation.receivedAt} />],
              [
                "Location",
                observation.location
                  ? `${observation.location.lat.toFixed(5)}, ${observation.location.lon.toFixed(5)} (±${Math.round(observation.location.accuracyM)} m, ${observation.location.provider.replace(/_/g, " ").toLowerCase()})`
                  : "Not available",
              ],
            ]}
          />
        </section>
        <section aria-label="Verification">
          <h3>Verification (has anyone confirmed it?)</h3>
          <div className="row">
            <StatusBadge kind="review" value={verification.reviewState} />
            {hazard.provisionalCaution ? <span className="small muted">Shown as caution only until verified.</span> : null}
          </div>
          {verification.rejectionReason ? <p className="small">Rejection reason: {verification.rejectionReason.replace(/_/g, " ").toLowerCase()}</p> : null}
          {verification.notes ? <p className="small">Reviewer notes: {verification.notes}</p> : null}
          {verification.version !== undefined ? <p className="small muted">Record version {verification.version}</p> : null}
        </section>
        <section aria-label="Hazard">
          <h3>Hazard (reporter&apos;s severity assessment)</h3>
          <StatusBadge kind="severity" value={hazard.severity} />
        </section>
        {media}
      </div>
    </Card>
  );
}

/** Statement about how old data is and when a snapshot stops being valid. */
export function ValidityStatement({ evaluatedAt, expiresAt }: { evaluatedAt: string; expiresAt: string }) {
  const now = useNow(15_000);
  const left = secondsUntil(expiresAt, now);
  const expired = left !== null && left <= 0;
  return (
    <p className="small">
      Evaluated {formatAge(evaluatedAt, now)}.{" "}
      {expired ? <strong>This snapshot has expired; recompute before acting.</strong> : left !== null ? `Valid for about ${Math.max(1, Math.round(left / 60))} more minute(s).` : null}
    </p>
  );
}
