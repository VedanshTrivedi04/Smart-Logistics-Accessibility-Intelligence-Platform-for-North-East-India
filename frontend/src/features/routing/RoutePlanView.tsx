"use client";

import { useMemo, useState, type FormEvent } from "react";
import type { DispatchAction, RoutePlan } from "@/shared/api";
import { humanize } from "@/shared/lib/format";
import { formatDateTime, formatDuration, secondsUntil } from "@/shared/lib/time";
import { formatDistance, bboxOfCoordinates } from "@/shared/lib/geo";
import { MapLegend, MapView } from "@/shared/map";
import { Banner, Button, Card, ErrorNotice, Field, KeyValue, StatusBadge, useAnnounce, ValidityStatement } from "@/shared/ui";
import { useNow } from "@/shared/lib/useNow";
import { exclusionSummary, lineStrings, planLines } from "./geometry";
import { POLICY_LABEL, useDispatchDecision } from "./queries";

/** The operator-configured escalation instruction. There is never an invented contact or an auto-generated detour. */
function escalationInstructions(): string | null {
  return process.env.NEXT_PUBLIC_ESCALATION_INSTRUCTIONS?.trim() || null;
}

export function RouteExplanation({ plan }: { plan: RoutePlan }) {
  const exclusions = useMemo(() => exclusionSummary(plan.excluded_edge_reasons), [plan.excluded_edge_reasons]);
  const now = useNow(15_000);
  const left = secondsUntil(plan.expires_at, now);
  return (
    <Card title="Why this result">
      <div className="stack">
        <KeyValue
          items={[
            ["Method", "Deterministic rules and hard constraints (not a machine-learning prediction)"],
            ["Policy", `${POLICY_LABEL[plan.policy_version as keyof typeof POLICY_LABEL] ?? humanize(plan.policy_version)} (${plan.policy_version})`],
            ["Network snapshot", `graph ${plan.graph_version} · road-status version ${plan.status_version}`],
            ["Evaluated", formatDateTime(plan.evaluated_at)],
            ["Valid until", `${formatDateTime(plan.expires_at)}${left !== null && left <= 0 ? " — expired" : ""}`],
            ["Human review", plan.requires_human_review ? "Required before acting" : "Not flagged by the rules"],
          ]}
        />
        <div>
          <h3>Hard exclusions</h3>
          {exclusions.length ? (
            <ul>
              {exclusions.map((e) => (
                <li key={e.reason}>{humanize(e.reason)} — {e.segments} segment{e.segments === 1 ? "" : "s"} excluded</li>
              ))}
            </ul>
          ) : (
            <p className="small muted">No segments were excluded by hard rules.</p>
          )}
          <p className="small muted">Excluded segments are never used, even if they would be faster.</p>
        </div>
        {plan.result_status === "INSUFFICIENT_DATA" ? (
          <p className="small"><strong>Missing constraints:</strong> the network does not hold enough data (for example a bridge limit or a link to the road network) to give a safe answer, so none is given.</p>
        ) : null}
      </div>
    </Card>
  );
}

function ResultBanner({ plan }: { plan: RoutePlan }) {
  if (plan.result_status === "NO_FEASIBLE_PATH") {
    const instructions = escalationInstructions();
    return (
      <Banner tone="danger" title="No feasible path">
        <p className="small">Every admissible route is closed or incompatible with this vehicle and cargo. No detour is suggested and no closed segment is used.</p>
        <p className="small">
          <strong>Escalation:</strong>{" "}
          {instructions ?? "No escalation instructions are configured for this deployment. Ask your administrator to set NEXT_PUBLIC_ESCALATION_INSTRUCTIONS."}
        </p>
      </Banner>
    );
  }
  if (plan.result_status === "INSUFFICIENT_DATA") {
    return (
      <Banner tone="caution" title="Insufficient data — road condition unknown; verification required">
        <p className="small">This is not the same as no path. Ask a qualified reviewer to confirm the missing information before relying on any route.</p>
      </Banner>
    );
  }
  return null;
}

export function DispatchDecisionForm({ tripId, plan, selectedRank }: { tripId: string; plan: RoutePlan; selectedRank: number }) {
  const decide = useDispatchDecision();
  const announce = useAnnounce();
  const now = useNow(15_000);
  const [action, setAction] = useState<DispatchAction>("ACCEPTED");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const expired = (secondsUntil(plan.expires_at, now) ?? 1) <= 0;
  const infeasible = plan.result_status !== "FEASIBLE";

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (reason.trim().length < 5) return setError("Give a reason. It is recorded with the decision.");
    decide.mutate({ tripId, routePlanId: plan.id, action, selectedAlternativeRank: selectedRank, reason: reason.trim() }, { onSuccess: () => announce("Dispatch decision recorded by the server") });
  };

  if (decide.isSuccess) {
    const d = decide.data;
    return (
      <Banner tone="ok" title="Decision recorded by the server">
        <p className="small">{humanize(d.action)} · alternative {d.selected_alternative_rank} · at {formatDateTime(d.decided_at)} · road-status version {d.status_version_at_decision}</p>
        <p className="small">Decision receipt: <span className="mono">{d.id}</span></p>
      </Banner>
    );
  }
  return (
    <form className="stack" onSubmit={submit} aria-label="Dispatch decision">
      <h3>Dispatch decision</h3>
      {expired ? <Banner tone="warn" title="Recommendation expired"><p className="small">Recompute the route before deciding.</p></Banner> : null}
      {infeasible ? <p className="small muted">A decision to accept is not possible without a feasible plan. You may still record a rejection or diversion.</p> : null}
      <Field label="Decision" htmlFor="dd-action">
        <select id="dd-action" value={action} onChange={(e) => setAction(e.target.value as DispatchAction)}>
          <option value="ACCEPTED" disabled={infeasible}>Accept the selected route</option>
          <option value="DIVERTED">Divert to the selected alternative</option>
          <option value="REJECTED">Reject the recommendation</option>
        </select>
      </Field>
      <p className="small">Selected: {selectedRank === 0 ? "recommended route" : `alternative ${selectedRank}`}</p>
      <Field label="Reason (required)" htmlFor="dd-reason" error={error}>
        <textarea id="dd-reason" value={reason} onChange={(e) => setReason(e.target.value)} />
      </Field>
      {decide.isError ? <ErrorNotice error={decide.error} subject="this decision" /> : null}
      <p className="small muted">The server re-checks that this snapshot is still current before recording the decision. This is a human decision record; the model does not dispatch vehicles.</p>
      <Button type="submit" variant="primary" busy={decide.isPending} disabled={expired || (action === "ACCEPTED" && infeasible)}>Record decision</Button>
    </form>
  );
}

interface ViewProps {
  plan: RoutePlan;
  /** When set, a dispatch decision can be recorded against this trip. */
  tripId?: string | null;
  canDecide?: boolean;
  label?: string;
}

export function RoutePlanView({ plan, tripId, canDecide, label }: ViewProps) {
  const [rank, setRank] = useState<number>(0);
  const lines = useMemo(() => planLines(plan, rank === 0 ? null : rank), [plan, rank]);
  const all = useMemo(() => [...lineStrings(plan.primary_geometry), ...plan.alternatives.flatMap((a) => lineStrings(a.geometry))].flat(), [plan]);
  const bounds = useMemo(() => bboxOfCoordinates(all), [all]);
  const primaryDuration = plan.total_duration_seconds;

  return (
    <div className="stack">
      {label ? <h2>{label}</h2> : null}
      <div className="row"><StatusBadge kind="route" value={plan.result_status} /></div>
      <ResultBanner plan={plan} />
      <ValidityStatement evaluatedAt={plan.evaluated_at} expiresAt={plan.expires_at} />
      {plan.result_status === "FEASIBLE" ? (
        <>
          <div className="split">
            <div className="stack">
              <MapView ariaLabel="Route options" height={360} lines={lines} fitBounds={bounds} fitKey={plan.id} />
              <MapLegend showRoutes />
            </div>
            <Card title="Options">
              <div className="table-wrap">
                <table>
                  <caption className="sr-only">Route options with estimated time and distance</caption>
                  <thead><tr><th scope="col">Choose</th><th scope="col">Route</th><th scope="col">Time</th><th scope="col">Distance</th></tr></thead>
                  <tbody>
                    <tr aria-selected={rank === 0}>
                      <td><input type="radio" name="route-choice" aria-label="Choose the recommended route" checked={rank === 0} onChange={() => setRank(0)} /></td>
                      <td>Recommended</td>
                      <td>{formatDuration(primaryDuration)}</td>
                      <td>{formatDistance(plan.total_distance_meters)}</td>
                    </tr>
                    {plan.alternatives.map((a) => (
                      <tr key={a.rank} aria-selected={rank === a.rank}>
                        <td><input type="radio" name="route-choice" aria-label={`Choose alternative ${a.rank}`} checked={rank === a.rank} onChange={() => setRank(a.rank)} /></td>
                        <td>Alternative {a.rank}</td>
                        <td>{formatDuration(a.total_duration_seconds)} <span className="small muted">({a.total_duration_seconds >= primaryDuration ? "+" : "−"}{formatDuration(Math.abs(a.total_duration_seconds - primaryDuration))})</span></td>
                        <td>{formatDistance(a.total_distance_meters)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {plan.alternatives.length === 0 ? <p className="small muted">No alternative route satisfies the hard constraints.</p> : null}
              <p className="small muted">Times are estimates from the network snapshot, not live traffic.</p>
            </Card>
          </div>
        </>
      ) : null}
      <RouteExplanation plan={plan} />
      {tripId && canDecide ? <Card><DispatchDecisionForm key={`${plan.id}-${rank}`} tripId={tripId} plan={plan} selectedRank={rank} /></Card> : null}
    </div>
  );
}
