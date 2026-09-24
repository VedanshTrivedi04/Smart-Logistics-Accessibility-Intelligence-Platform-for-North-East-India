"use client";

import { useState } from "react";
import type { Report } from "@/shared/api";
import { useSession } from "@/shared/auth";
import { humanize } from "@/shared/lib/format";
import { Button, EvidencePanel, ErrorNotice } from "@/shared/ui";
import { useMediaUrl } from "./queries";

function MediaItem({ mediaId, index }: { mediaId: string; index: number }) {
  const [requested, setRequested] = useState(false);
  const url = useMediaUrl(requested ? mediaId : null);
  return (
    <li>
      {!requested ? (
        <Button size="small" onClick={() => setRequested(true)}>Load photo {index + 1}</Button>
      ) : url.isPending ? (
        <span role="status" className="small muted">Requesting a time-limited link…</span>
      ) : url.isError ? (
        <ErrorNotice error={url.error} subject="this photo" />
      ) : (
        // eslint-disable-next-line @next/next/no-img-element -- signed, expiring storage URL; next/image cannot optimize it
        <img src={url.data.download_url} alt={`Evidence photo ${index + 1} attached to the report`} style={{ maxWidth: "100%", borderRadius: 8 }} />
      )}
    </li>
  );
}

/** Photos are loaded only on request: they are large, sensitive, and served by short-lived signed links. */
export function ReportMedia({ mediaIds }: { mediaIds: readonly string[] }) {
  const { can } = useSession();
  if (mediaIds.length === 0) return <p className="small muted">No photos attached.</p>;
  if (!can("VIEW_REPORT_MEDIA")) return <p className="small muted">{mediaIds.length} photo(s) attached. Viewing media is not part of your role.</p>;
  return (
    <section aria-label="Attached photos">
      <h3>Photos ({mediaIds.length})</h3>
      <ul className="stack" style={{ listStyle: "none", padding: 0, margin: 0 }}>
        {mediaIds.map((id, i) => <MediaItem key={id} mediaId={id} index={i} />)}
      </ul>
    </section>
  );
}

export function ReportEvidence({ report }: { report: Report }) {
  return (
    <EvidencePanel
      observation={{
        typeLabel: humanize(report.report_type),
        description: report.description,
        observedAt: report.observed_at,
        receivedAt: report.received_at,
        location: { lat: report.location.latitude, lon: report.location.longitude, accuracyM: report.location.accuracy_m, provider: report.location.location_provider ?? "GPS_HARDWARE" },
      }}
      verification={{ reviewState: report.review_state, notes: report.rejection_notes, rejectionReason: report.rejection_reason, version: report.version }}
      hazard={{ severity: report.severity, provisionalCaution: report.is_provisional_caution }}
      media={<ReportMedia mediaIds={report.media_ids} />}
    />
  );
}
