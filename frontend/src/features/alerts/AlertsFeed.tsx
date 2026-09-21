"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useSession } from "@/shared/auth";
import { pilotLocale, renderNotice } from "@/shared/i18n";
import { usePreferences } from "@/shared/lib/preferences";
import { formatAge } from "@/shared/lib/time";
import { useNow } from "@/shared/lib/useNow";
import { Banner, Card, ErrorNotice, StatusBadge } from "@/shared/ui";
import { useFleetPositions, useVehicles, useCommitments } from "@/features/fleet";
import { useImpactData } from "@/features/impact";
import { useIncidents, useReports } from "@/features/incidents";
import { buildNotices, type Notice, type NoticeInput, type NoticeSeverity } from "./build";

const SEVERITY_KIND: Record<NoticeSeverity, string> = { CRITICAL: "CRITICAL", HIGH: "HIGH", MEDIUM: "MEDIUM", INFO: "LOW" };

export function NoticeList({ notices, emptyText }: { notices: readonly Notice[]; emptyText: string }) {
  const [prefs] = usePreferences();
  const now = useNow(60_000);
  if (notices.length === 0) return <p className="muted">{emptyText}</p>;
  return (
    <ul className="stack" style={{ listStyle: "none", padding: 0, margin: 0 }}>
      {notices.map((n) => {
        const r = renderNotice(n.code, n.params, prefs.locale);
        return (
          <li key={n.id} className="card" style={{ padding: "0.7rem 0.9rem" }}>
            <div className="row">
              <StatusBadge kind="severity" value={SEVERITY_KIND[n.severity]} />
              <span className="mono small muted">{n.code}</span>
              <span className="small muted right">{formatAge(n.at, now)}</span>
            </div>
            <p style={{ margin: "0.35rem 0 0" }}>{n.href ? <Link href={n.href}>{r.text}</Link> : r.text}</p>
            {r.fellBack ? <p className="small muted" style={{ margin: 0 }}>Shown in English: no reviewed {prefs.locale} template exists for this notice.</p> : null}
          </li>
        );
      })}
    </ul>
  );
}

export function NoticeDisclaimer() {
  const pilot = pilotLocale();
  return (
    <Banner tone="neutral" title="How these notices work">
      <p className="small">
        These are computed from current records, not pushed messages: delivery, read receipts and acknowledgement are not connected yet. Wording comes from reviewed templates keyed by event code.{" "}
        {pilot ? `The pilot language (${pilot}) is used only where a reviewed template exists.` : "No pilot language is configured, so notices are in English."}
      </p>
    </Banner>
  );
}

export function useGovernmentNotices() {
  const { can } = useSession();
  const incidents = useIncidents("ACTIVE");
  const reports = useReports(undefined, can("VIEW_REPORT_SUMMARY"));
  const impact = useImpactData();
  const commitments = useCommitments(undefined, can("VIEW_FLEET"));
  const vehicles = useVehicles(can("VIEW_FLEET"));
  const positions = useFleetPositions(vehicles.data);
  const notices = useMemo(
    () =>
      buildNotices({
        incidents: incidents.data ?? [],
        reports: reports.data ?? [],
        facilityImpacts: impact.facilityImpacts,
        tripImpacts: impact.tripImpacts,
        commitments: commitments.data ?? [],
        vehiclePositions: positions.map((p) => ({ registration: p.vehicle.registration_number, vehicleId: p.vehicle.id, position: p.position })),
        hrefs: { incident: (id) => `/gov/incidents/${id}`, report: (id) => `/gov/reports/${id}`, trip: (id) => `/gov/fleet/trips/${id}`, vehicle: (id) => `/gov/fleet/vehicles/${id}` },
      }),
    [incidents.data, reports.data, impact.facilityImpacts, impact.tripImpacts, commitments.data, positions],
  );
  return { notices, loading: incidents.isPending || impact.loading, error: incidents.error ?? reports.error ?? impact.errors[0] ?? null };
}

export function useLogisticsNotices() {
  const impact = useImpactData();
  const commitments = useCommitments();
  const vehicles = useVehicles();
  const positions = useFleetPositions(vehicles.data);
  const notices = useMemo(
    () =>
      buildNotices({
        tripImpacts: impact.tripImpacts,
        commitments: commitments.data ?? [],
        vehiclePositions: positions.map((p) => ({ registration: p.vehicle.registration_number, vehicleId: p.vehicle.id, position: p.position })),
        hrefs: { trip: (id) => `/logistics/trips/${id}`, vehicle: (id) => `/logistics/vehicles/${id}` },
      }),
    [impact.tripImpacts, commitments.data, positions],
  );
  return { notices, loading: impact.loading, error: impact.errors[0] ?? commitments.error ?? null };
}

/** Government audience: verification queue, critical incidents, facility isolation, delivery risk. */
export function GovernmentAlerts() {
  const { notices, loading, error } = useGovernmentNotices();
  return (
    <div className="stack">
      <NoticeDisclaimer />
      {error ? <ErrorNotice error={error} subject="some alert sources" /> : null}
      <Card title={`Notices (${notices.length})`}>
        {loading ? <p role="status" className="muted">Checking sources…</p> : null}
        <NoticeList notices={notices} emptyText="No notices from the records visible to you. This is not a guarantee that nothing is wrong: sources that failed to load are listed above." />
      </Card>
    </div>
  );
}

/** Logistics audience: only the organization's own trips, consignments and vehicles. */
export function LogisticsAlerts() {
  const { notices, loading, error } = useLogisticsNotices();
  return (
    <div className="stack">
      <NoticeDisclaimer />
      {error ? <ErrorNotice error={error} subject="some alert sources" /> : null}
      <Card title={`Notices (${notices.length})`}>
        {loading ? <p role="status" className="muted">Checking sources…</p> : null}
        <NoticeList notices={notices} emptyText="No notices for your trips, consignments or vehicles." />
      </Card>
    </div>
  );
}

export type { NoticeInput };
