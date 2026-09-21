"use client";

import { useMemo, useState } from "react";
import { useSession } from "@/shared/auth";
import { downloadText, humanize, toCsv } from "@/shared/lib/format";
import { clock } from "@/shared/lib/time";
import { Banner, Bars, Button, Card, Field, PageHeader, Stat, Tabs } from "@/shared/ui";
import { useCommitments, useTrips } from "@/features/fleet";
import { LIST_LIMIT, useIncidents, useReports } from "@/features/incidents";
import { countBy, dailyCounts, delta, inPeriod, resolvePeriod, type PeriodKey } from "./periods";

const TABS: ReadonlyArray<{ id: PeriodKey; label: string }> = [
  { id: "today", label: "Today" },
  { id: "week", label: "Last 7 days" },
  { id: "month", label: "Last 30 days" },
  { id: "custom", label: "Custom" },
];

/**
 * Operational reports computed from the records the server returns. Only what the API holds is
 * charted: road-status history, weather and delay-cause data are not exposed yet.
 */
export function AnalyticsView() {
  const { can } = useSession();
  const [key, setKey] = useState<PeriodKey>("week");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const incidents = useIncidents();
  const reports = useReports(undefined, can("VIEW_REPORT_SUMMARY"));
  const fleet = can("VIEW_FLEET");
  const commitments = useCommitments(undefined, fleet);
  const trips = useTrips(undefined, fleet);

  const { current, previous } = useMemo(() => resolvePeriod(key, clock.now(), { from, to }), [key, from, to]);
  const inc = useMemo(() => (incidents.data ?? []).filter((i) => inPeriod(i.created_at, current)), [incidents.data, current]);
  const incPrev = useMemo(() => (incidents.data ?? []).filter((i) => inPeriod(i.created_at, previous)), [incidents.data, previous]);
  const rep = useMemo(() => (reports.data ?? []).filter((r) => inPeriod(r.received_at, current)), [reports.data, current]);
  const repPrev = useMemo(() => (reports.data ?? []).filter((r) => inPeriod(r.received_at, previous)), [reports.data, previous]);
  const cm = useMemo(() => (commitments.data ?? []).filter((c) => inPeriod(c.created_at, current)), [commitments.data, current]);
  const tr = useMemo(() => (trips.data ?? []).filter((t) => inPeriod(t.scheduled_departure, current)), [trips.data, current]);
  const truncated = (incidents.data?.length ?? 0) >= LIST_LIMIT || (reports.data?.length ?? 0) >= LIST_LIMIT;

  return (
    <div className="stack">
      <PageHeader title="Analytics and reports" subtitle={`${current.start.toLocaleDateString()} – ${new Date(current.end.getTime() - 1).toLocaleDateString()}`} />
      <Tabs tabs={TABS} value={key} onChange={setKey} label="Reporting period" />
      {key === "custom" ? (
        <div className="row">
          <Field label="From" htmlFor="an-from"><input id="an-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
          <Field label="To" htmlFor="an-to"><input id="an-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} /></Field>
        </div>
      ) : null}
      {truncated ? <Banner tone="warn" title="Partial history"><p className="small">The API returned its maximum of {LIST_LIMIT} records, so older records in this period may be missing.</p></Banner> : null}

      <div className="grid cols-4">
        <Card><Stat label="Incidents opened" value={inc.length} hint={delta(inc.length, incPrev.length)} /></Card>
        <Card><Stat label="Field reports received" value={can("VIEW_REPORT_SUMMARY") ? rep.length : "n/a"} hint={can("VIEW_REPORT_SUMMARY") ? delta(rep.length, repPrev.length) : undefined} /></Card>
        <Card><Stat label="Consignments created" value={fleet ? cm.length : "n/a"} hint={fleet ? undefined : "Fleet not in your role"} /></Card>
        <Card><Stat label="Trips scheduled" value={fleet ? tr.length : "n/a"} /></Card>
      </div>

      <div className="grid cols-2">
        <Card title="Incidents per day"><Bars rows={dailyCounts(inc.map((i) => i.created_at), current)} ariaLabel="Incidents per day" /></Card>
        <Card title="Incidents by severity"><Bars rows={countBy(inc, (i) => humanize(i.severity))} ariaLabel="Incidents by severity" /></Card>
        {can("VIEW_REPORT_SUMMARY") ? <Card title="Reports by type"><Bars rows={countBy(rep, (r) => humanize(r.report_type))} ariaLabel="Reports by type" /></Card> : null}
        {can("VIEW_REPORT_SUMMARY") ? <Card title="Reports by review state"><Bars rows={countBy(rep, (r) => humanize(r.review_state))} ariaLabel="Reports by review state" /></Card> : null}
        {fleet ? <Card title="Consignment delivery performance"><Bars rows={countBy(cm, (c) => humanize(c.sla_status))} ariaLabel="Consignments by deadline status" /></Card> : null}
        {fleet ? <Card title="Trips by status"><Bars rows={countBy(tr, (t) => humanize(t.status))} ariaLabel="Trips by status" /></Card> : null}
      </div>

      {can("EXPORT_DATA") ? (
        <Card title="Export">
          <div className="row">
            <Button size="small" onClick={() => downloadText("incidents-period.csv", toCsv(["id", "title", "severity", "lifecycle", "created_at"], inc.map((i) => [i.id, i.title, i.severity, i.lifecycle, i.created_at])))}>Incidents (CSV)</Button>
            <Button size="small" onClick={() => downloadText("reports-period.csv", toCsv(["id", "type", "severity", "review_state", "observed_at", "received_at"], rep.map((r) => [r.id, r.report_type, r.severity, r.review_state, r.observed_at, r.received_at])))}>Reports (CSV)</Button>
          </div>
          <p className="small muted">Exports contain only the records already visible to you and no exact coordinates.</p>
        </Card>
      ) : null}

      <Banner tone="neutral" title="Not available yet">
        <p className="small">Road disruption frequency, route risk history, district connectivity trends and delay causes need historical status and weather data that the API does not expose. They are intentionally absent rather than estimated.</p>
      </Banner>
    </div>
  );
}
