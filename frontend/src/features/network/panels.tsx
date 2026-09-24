"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { ACCESSIBILITY_STATUSES, type AccessibilityStatus, type Facility } from "@/shared/api";
import { useSession } from "@/shared/auth";
import { formatDateTime } from "@/shared/lib/time";
import { humanize } from "@/shared/lib/format";
import { formatDistance } from "@/shared/lib/geo";
import { Banner, Button, Card, ErrorNotice, Field, KeyValue, QueryState, StatusBadge, useAnnounce } from "@/shared/ui";
import { edgeLabel } from "./edges";
import { useDeclareEdgeStatus, useEdge, useFacilityImpacts, useReachability } from "./queries";

const DECLARABLE: readonly AccessibilityStatus[] = ACCESSIBILITY_STATUSES.filter((s) => s !== "UNKNOWN");

/** The schema types restrictions as free-form objects, so narrow each field before display. */
function describeRestriction(r: object): string {
  const v = r as Record<string, unknown>;
  const kind = typeof v["kind"] === "string" ? humanize(v["kind"]) : "Restriction";
  const value = v["value_numeric"] !== null && v["value_numeric"] !== undefined ? `: ${String(v["value_numeric"])} ${typeof v["unit"] === "string" ? v["unit"] : ""}`.trimEnd() : "";
  const direction = typeof v["direction"] === "string" && v["direction"] ? ` (${v["direction"]})` : "";
  return `${kind}${value}${direction}`;
}

function DeclareStatusForm({ edgeId, currentStatus, currentVersion }: { edgeId: string; currentStatus: string; currentVersion: number }) {
  const declare = useDeclareEdgeStatus();
  const announce = useAnnounce();
  const [status, setStatus] = useState<AccessibilityStatus>("BLOCKED");
  const [reason, setReason] = useState("");
  const [validUntil, setValidUntil] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setLocalError(null);
    if (reason.trim().length < 10) return setLocalError("Give a reason of at least 10 characters. It is recorded in the audit trail.");
    if (status === "OPEN" && currentStatus !== "OPEN" && !confirmed) return setLocalError("Confirm that you are authorized to reopen this road segment.");
    declare.mutate(
      { edgeId, status, reason: reason.trim(), validUntil: validUntil ? new Date(validUntil).toISOString() : null },
      {
        onSuccess: () => {
          announce(`Road status declared as ${humanize(status)}`);
          setReason("");
          setConfirmed(false);
        },
      },
    );
  };

  return (
    <form onSubmit={submit} className="stack" aria-label="Declare road status">
      <h3>Declare official status</h3>
      <p className="small muted">Current server status version {currentVersion}. The screen updates only after the server confirms the change.</p>
      <Field label="New status" htmlFor="ds-status">
        <select id="ds-status" value={status} onChange={(e) => setStatus(e.target.value as AccessibilityStatus)}>
          {DECLARABLE.map((s) => (
            <option key={s} value={s}>{humanize(s)}</option>
          ))}
        </select>
      </Field>
      <Field label="Reason (required)" htmlFor="ds-reason" error={localError}>
        <textarea id="ds-reason" value={reason} onChange={(e) => setReason(e.target.value)} required aria-required="true" />
      </Field>
      <Field label="Valid until (optional)" htmlFor="ds-until" hint="Leave empty if this stays in force until someone changes it.">
        <input id="ds-until" type="datetime-local" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} />
      </Field>
      {status === "OPEN" && currentStatus !== "OPEN" ? (
        <label className="row">
          <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />
          <span>I am authorized to reopen this segment based on a fresh inspection.</span>
        </label>
      ) : null}
      {declare.isError ? <ErrorNotice error={declare.error} subject="this status change" /> : null}
      {declare.isSuccess ? <Banner tone="ok" title="Status recorded by the server" /> : null}
      <Button type="submit" variant="primary" busy={declare.isPending}>Record status</Button>
    </form>
  );
}

export function EdgePanel({ edgeId, onClose }: { edgeId: string; onClose?: () => void }) {
  const { can } = useSession();
  const query = useEdge(edgeId);
  return (
    <Card title="Road segment" actions={onClose ? <Button size="small" onClick={onClose}>Close</Button> : undefined}>
      <QueryState query={query} subject="road segment">
        {(e) => (
          <div className="stack">
            <div>
              <strong>{edgeLabel({ road_name: e.road_name ?? null, edge_index: e.edge_index })}</strong>
              <div className="row" style={{ marginTop: "0.35rem" }}>
                <StatusBadge kind="access" value={e.status} />
                {e.is_bridge ? <span className="badge tone-neutral">Bridge</span> : null}
                {e.is_one_way ? <span className="badge tone-neutral">One-way</span> : null}
              </div>
              {e.status === "UNKNOWN" ? <p className="small">Road condition unknown; verification required.</p> : null}
            </div>
            <KeyValue
              items={[
                ["Freshness", humanize(e.freshness)],
                ["Status version", String(e.status_version)],
                ["Road class", humanize(e.road_class)],
                ["Surface", humanize(e.surface_type)],
                ["Length", formatDistance(e.length_meters)],
                ["Speed limit", `${e.speed_limit_kmh} km/h`],
              ]}
            />
            <div>
              <h3>Restrictions in force</h3>
              {e.restrictions.length ? (
                <ul>
                  {e.restrictions.map((r, i) => (
                    <li key={i}>{describeRestriction(r)}</li>
                  ))}
                </ul>
              ) : (
                <p className="small muted">No structural restrictions recorded for this segment.</p>
              )}
            </div>
            <Banner tone="neutral" title="Status history">
              <p className="small">The API exposes only the current status version for a segment, so a per-segment timeline cannot be shown yet.</p>
            </Banner>
            {can("UPDATE_ROAD_STATUS") ? <DeclareStatusForm edgeId={e.id} currentStatus={e.status} currentVersion={e.status_version} /> : null}
          </div>
        )}
      </QueryState>
    </Card>
  );
}

export function facilityLabel(f: Pick<Facility, "name" | "kind" | "code">): string {
  return `${f.name} (${humanize(f.kind)})`;
}

export function FacilityPanel({ facility, onClose, routeBase }: { facility: Facility; onClose?: () => void; routeBase?: string }) {
  const { can } = useSession();
  const [weight, setWeight] = useState("");
  const tonnes = weight ? Number(weight) : undefined;
  const reach = useReachability(facility.id, tonnes && tonnes > 0 ? tonnes : undefined);
  const impacts = useFacilityImpacts(facility.id);
  return (
    <Card title={facility.name} actions={onClose ? <Button size="small" onClick={onClose}>Close</Button> : undefined}>
      <div className="stack">
        <KeyValue
          items={[
            ["Kind", humanize(facility.kind)],
            ["Code", facility.code],
            ["Critical", facility.is_critical ? "Yes" : "No"],
            ["Position", `${facility.lat.toFixed(5)}, ${facility.lon.toFixed(5)}`],
            ["Network link", facility.nearest_road_node_id ? `Snapped ${facility.snap_distance_m?.toFixed(0) ?? "?"} m to network` : "Not linked to the road network"],
          ]}
        />
        {routeBase && can("COMPUTE_ROUTE") ? <p className="small"><Link href={`${routeBase}?destFacilityId=${facility.id}`}>Plan a route to here →</Link></p> : null}
        <Field label="Vehicle weight to check (tonnes, optional)" htmlFor="fw">
          <input id="fw" inputMode="decimal" value={weight} onChange={(e) => setWeight(e.target.value)} />
        </Field>
        <QueryState query={reach} subject="reachability">
          {(r) => (
            <div className="stack">
              <StatusBadge kind="reach" value={r.status} />
              <p className="small">{r.reason}</p>
              {r.origin_hub_name ? <p className="small">From: {r.origin_hub_name}</p> : null}
              {r.total_seconds ? <p className="small">Estimated travel time: {Math.round(r.total_seconds / 60)} min over {r.edge_count ?? "?"} segments</p> : null}
              {r.bottlenecks && r.bottlenecks.length ? (
                <div>
                  <h3>Bottlenecks</h3>
                  <ul>{r.bottlenecks.map((b, i) => <li key={i} className="small">{JSON.stringify(b)}</li>)}</ul>
                </div>
              ) : null}
              {r.status === "NO_FEASIBLE_PATH" ? <p className="small"><strong>No feasible path is different from “unknown”:</strong> the network is known and every admissible route is closed or incompatible.</p> : null}
            </div>
          )}
        </QueryState>
        <div>
          <h3>Disruption impacts</h3>
          <QueryState query={impacts} subject="facility impacts" isEmpty={(d) => d.length === 0} emptyMessage="No disruption impacts recorded for this facility.">
            {(list) => (
              <ul className="stack" style={{ listStyle: "none", padding: 0, margin: 0 }}>
                {list.map((i) => (
                  <li key={i.id}>
                    <StatusBadge kind="reach" value={i.reachability_state} />{" "}
                    {i.isolated ? <span className="badge tone-danger">Isolated</span> : null}
                    <div className="small muted">Assessed {formatDateTime(i.assessed_at)} · status version {i.source_status_version} · delay {Math.round(i.access_delay_seconds / 60)} min · alternate route {i.alternate_route_available ? "available" : "not available"}</div>
                  </li>
                ))}
              </ul>
            )}
          </QueryState>
        </div>
      </div>
    </Card>
  );
}
