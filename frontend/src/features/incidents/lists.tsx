"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { IncidentLifecycle, ReviewState } from "@/shared/api";
import { downloadText, humanize, shortId, toCsv } from "@/shared/lib/format";
import { formatDateTime } from "@/shared/lib/time";
import { useSession } from "@/shared/auth";
import { Button, Card, QueryState, StatusBadge, Tabs } from "@/shared/ui";
import { LIST_LIMIT, useIncidents, useReports } from "./queries";

type LifecycleTab = "all" | IncidentLifecycle;
const LIFECYCLE_TABS: ReadonlyArray<{ id: LifecycleTab; label: string }> = [
  { id: "all", label: "All" },
  { id: "ACTIVE", label: "Active" },
  { id: "MONITORING", label: "Monitoring" },
  { id: "RESOLVED", label: "Resolved" },
];

export function IncidentList({ basePath }: { basePath: string }) {
  const [tab, setTab] = useState<LifecycleTab>("ACTIVE");
  const [search, setSearch] = useState("");
  const { can } = useSession();
  const query = useIncidents(tab === "all" ? undefined : tab);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = query.data ?? [];
    return q ? list.filter((i) => `${i.title} ${i.description}`.toLowerCase().includes(q)) : list;
  }, [query.data, search]);

  return (
    <Card
      title="Incidents"
      actions={
        can("EXPORT_DATA") && rows.length ? (
          <Button size="small" onClick={() => downloadText("incidents.csv", toCsv(["id", "title", "lifecycle", "severity", "created_at"], rows.map((i) => [i.id, i.title, i.lifecycle, i.severity, i.created_at])))}>
            Export CSV
          </Button>
        ) : undefined
      }
    >
      <div className="stack">
        <Tabs tabs={LIFECYCLE_TABS} value={tab} onChange={setTab} label="Incident lifecycle" />
        <div className="field">
          <label htmlFor="inc-search" className="sr-only">Search incidents</label>
          <input id="inc-search" placeholder="Search title or description" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <QueryState query={query} subject="incidents" isEmpty={() => rows.length === 0} emptyMessage="No incidents match in your scope.">
          {(all) => (
            <>
              {all.length >= LIST_LIMIT ? <p className="small muted">Showing the first {LIST_LIMIT} incidents; narrow the lifecycle filter to see others.</p> : null}
              <div className="table-wrap">
                <table>
                  <caption className="sr-only">Incidents</caption>
                  <thead><tr><th scope="col">Incident</th><th scope="col">Severity</th><th scope="col">Lifecycle</th><th scope="col">Created</th></tr></thead>
                  <tbody>
                    {rows.map((i) => (
                      <tr key={i.id}>
                        <td>
                          <Link href={`${basePath}/${i.id}`}>{i.title || `Incident ${shortId(i.id)}`}</Link>
                          <div className="small muted">{i.description.slice(0, 120)}</div>
                        </td>
                        <td><StatusBadge kind="severity" value={i.severity} /></td>
                        <td><StatusBadge kind="lifecycle" value={i.lifecycle} /></td>
                        <td>{formatDateTime(i.created_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </QueryState>
      </div>
    </Card>
  );
}

type ReviewTab = "all" | ReviewState;
const REVIEW_TABS: ReadonlyArray<{ id: ReviewTab; label: string }> = [
  { id: "SUBMITTED", label: "Awaiting review" },
  { id: "PROVISIONAL_CAUTION", label: "Provisional caution" },
  { id: "UNDER_REVIEW", label: "Under review" },
  { id: "MORE_INFO_NEEDED", label: "More info needed" },
  { id: "VERIFIED", label: "Verified" },
  { id: "REJECTED", label: "Rejected" },
  { id: "all", label: "All" },
];

export function ReportQueue({ basePath }: { basePath: string }) {
  const [tab, setTab] = useState<ReviewTab>("SUBMITTED");
  const query = useReports(tab === "all" ? undefined : tab);
  return (
    <Card title="Field reports">
      <div className="stack">
        <Tabs tabs={REVIEW_TABS} value={tab} onChange={setTab} label="Review state" />
        <QueryState query={query} subject="reports" isEmpty={(d) => d.length === 0} emptyMessage="No reports in this state within your scope.">
          {(rows) => (
            <div className="table-wrap">
              <table>
                <caption className="sr-only">Field reports</caption>
                <thead><tr><th scope="col">Report</th><th scope="col">Severity</th><th scope="col">Review state</th><th scope="col">Observed</th><th scope="col">Received</th></tr></thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id}>
                      <td>
                        <Link href={`${basePath}/${r.id}`}>{humanize(r.report_type)} · {shortId(r.id)}</Link>
                        <div className="small muted">{r.description.slice(0, 100)}</div>
                      </td>
                      <td><StatusBadge kind="severity" value={r.severity} /></td>
                      <td><StatusBadge kind="review" value={r.review_state} /></td>
                      <td>{formatDateTime(r.observed_at)}</td>
                      <td>{formatDateTime(r.received_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </QueryState>
      </div>
    </Card>
  );
}
