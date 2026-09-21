"use client";

import { useState, type FormEvent } from "react";
import { POLICY_VERSIONS, PRIORITY_TIERS, type Facility, type PolicyVersion, type PriorityTier, type RoutePlan } from "@/shared/api";
import { humanize } from "@/shared/lib/format";
import { isValidLatLon } from "@/shared/lib/geo";
import { Banner, Button, Card, ErrorNotice, Field, StatusBadge } from "@/shared/ui";
import { useEvaluateRoute, POLICY_LABEL, type EvaluateBase } from "./queries";
import { RoutePlanView } from "./RoutePlanView";

export interface VehicleOption {
  id: string;
  label: string;
  maxWeightKg: number;
  heightM: number;
  hazmatCapable: boolean;
}

interface Props {
  facilities: readonly Facility[];
  vehicles?: readonly VehicleOption[];
  /** Default trip to link the evaluation to. */
  tripId?: string | null;
  canDecide?: boolean;
  /** Evaluate under both policies and show them side by side. */
  compare?: boolean;
  /** Fixed endpoints (used from a trip page). */
  initial?: { originFacilityId?: string; destinationFacilityId?: string; vehicleId?: string; maxWeightKg?: number; priority?: PriorityTier };
  onPlan?: (plan: RoutePlan) => void;
}

type EndKind = "facility" | "coords";
interface End { kind: EndKind; facilityId: string; lat: string; lon: string }

function resolveEnd(prefix: "origin" | "destination", end: End, facilities: readonly Facility[]): Record<string, number> | string {
  if (end.kind === "facility") {
    const f = facilities.find((x) => x.id === end.facilityId);
    if (!f) return `Choose a ${prefix} facility.`;
    return { [`${prefix}_lat`]: f.lat, [`${prefix}_lon`]: f.lon };
  }
  const lat = Number(end.lat);
  const lon = Number(end.lon);
  if (!isValidLatLon(lat, lon)) return `Enter valid ${prefix} latitude and longitude.`;
  return { [`${prefix}_lat`]: lat, [`${prefix}_lon`]: lon };
}

function EndpointFields({ id, label, end, onChange, facilities }: { id: string; label: string; end: End; onChange: (e: End) => void; facilities: readonly Facility[] }) {
  return (
    <fieldset>
      <legend>{label}</legend>
      <div className="stack">
        <div className="row">
          <label className="row"><input type="radio" checked={end.kind === "facility"} onChange={() => onChange({ ...end, kind: "facility" })} /> Facility</label>
          <label className="row"><input type="radio" checked={end.kind === "coords"} onChange={() => onChange({ ...end, kind: "coords" })} /> Coordinates</label>
        </div>
        {end.kind === "facility" ? (
          <Field label="Facility" htmlFor={`${id}-f`}>
            <select id={`${id}-f`} value={end.facilityId} onChange={(e) => onChange({ ...end, facilityId: e.target.value })}>
              <option value="">Select a facility</option>
              {facilities.map((f) => <option key={f.id} value={f.id}>{f.name} ({humanize(f.kind)})</option>)}
            </select>
          </Field>
        ) : (
          <div className="grid cols-2">
            <Field label="Latitude" htmlFor={`${id}-lat`}><input id={`${id}-lat`} inputMode="decimal" value={end.lat} onChange={(e) => onChange({ ...end, lat: e.target.value })} /></Field>
            <Field label="Longitude" htmlFor={`${id}-lon`}><input id={`${id}-lon`} inputMode="decimal" value={end.lon} onChange={(e) => onChange({ ...end, lon: e.target.value })} /></Field>
          </div>
        )}
      </div>
    </fieldset>
  );
}

export function RouteEvaluator({ facilities, vehicles = [], tripId = null, canDecide = false, compare = false, initial, onPlan }: Props) {
  const evalA = useEvaluateRoute();
  const evalB = useEvaluateRoute();
  const [origin, setOrigin] = useState<End>({ kind: "facility", facilityId: initial?.originFacilityId ?? "", lat: "", lon: "" });
  const [dest, setDest] = useState<End>({ kind: "facility", facilityId: initial?.destinationFacilityId ?? "", lat: "", lon: "" });
  const [vehicleId, setVehicleId] = useState(initial?.vehicleId ?? "");
  const [weight, setWeight] = useState(initial?.maxWeightKg ? String(initial.maxWeightKg) : "");
  const [height, setHeight] = useState("");
  const [hazmat, setHazmat] = useState(false);
  const [priority, setPriority] = useState<PriorityTier>(initial?.priority ?? "TIER_3_STANDARD");
  const [policy, setPolicy] = useState<PolicyVersion>("CONSERVATIVE_CRITICAL_V1");
  const [error, setError] = useState<string | null>(null);

  const pickVehicle = (id: string) => {
    setVehicleId(id);
    const v = vehicles.find((x) => x.id === id);
    if (v) {
      setWeight(String(v.maxWeightKg));
      setHeight(String(v.heightM));
      setHazmat(v.hazmatCapable ? hazmat : false);
    }
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    const o = resolveEnd("origin", origin, facilities);
    const d = resolveEnd("destination", dest, facilities);
    if (typeof o === "string") return setError(o);
    if (typeof d === "string") return setError(d);
    const kg = Number(weight);
    if (!(kg > 0)) return setError("Enter the vehicle or cargo weight in kg.");
    const h = height ? Number(height) : undefined;
    if (h !== undefined && !(h > 0)) return setError("Height must be positive.");
    const base: EvaluateBase = {
      ...(o as Record<string, number>),
      ...(d as Record<string, number>),
      max_weight_kg: kg,
      height_m: h ?? 3,
      is_hazmat: hazmat,
      cargo_priority: priority,
      ...(vehicleId ? { vehicle_id: vehicleId } : {}),
      ...(tripId ? { trip_id: tripId } : {}),
    };
    evalA.mutate({ ...base, policy_version: policy }, { onSuccess: (p) => onPlan?.(p) });
    if (compare) {
      const other: PolicyVersion = policy === "CONSERVATIVE_CRITICAL_V1" ? "STANDARD_DISPATCH_V1" : "CONSERVATIVE_CRITICAL_V1";
      evalB.mutate({ ...base, policy_version: other });
    } else {
      evalB.reset();
    }
  };

  return (
    <div className="stack">
      <Card title="Evaluate a route">
        <form className="stack" onSubmit={submit} aria-label="Route evaluation">
          <div className="grid cols-2">
            <EndpointFields id="org" label="Origin" end={origin} onChange={setOrigin} facilities={facilities} />
            <EndpointFields id="dst" label="Destination" end={dest} onChange={setDest} facilities={facilities} />
          </div>
          {vehicles.length ? (
            <Field label="Vehicle (fills weight and height from its record)" htmlFor="rv-vehicle">
              <select id="rv-vehicle" value={vehicleId} onChange={(e) => pickVehicle(e.target.value)}>
                <option value="">No specific vehicle</option>
                {vehicles.map((v) => <option key={v.id} value={v.id}>{v.label}</option>)}
              </select>
            </Field>
          ) : null}
          <div className="grid cols-3">
            <Field label="Weight to check (kg)" htmlFor="rv-weight"><input id="rv-weight" inputMode="decimal" value={weight} onChange={(e) => setWeight(e.target.value)} required /></Field>
            <Field label="Height (m, optional)" htmlFor="rv-height" hint="The server assumes 3 m if empty."><input id="rv-height" inputMode="decimal" value={height} onChange={(e) => setHeight(e.target.value)} /></Field>
            <Field label="Cargo priority" htmlFor="rv-priority">
              <select id="rv-priority" value={priority} onChange={(e) => setPriority(e.target.value as PriorityTier)}>
                {PRIORITY_TIERS.map((t) => <option key={t} value={t}>{humanize(t)}</option>)}
              </select>
            </Field>
          </div>
          <div className="row">
            <label className="row"><input type="checkbox" checked={hazmat} onChange={(e) => setHazmat(e.target.checked)} /> Hazardous cargo</label>
            <Field label="Policy" htmlFor="rv-policy">
              <select id="rv-policy" value={policy} onChange={(e) => setPolicy(e.target.value as PolicyVersion)}>
                {POLICY_VERSIONS.map((p) => <option key={p} value={p}>{POLICY_LABEL[p]}</option>)}
              </select>
            </Field>
          </div>
          {error ? <p className="error" role="alert">{error}</p> : null}
          <div className="row">
            <Button type="submit" variant="primary" busy={evalA.isPending || evalB.isPending}>{compare ? "Compare policies" : "Evaluate route"}</Button>
            <span className="small muted">Evaluating creates a time-limited snapshot. It does not change any road status or dispatch anything.</span>
          </div>
        </form>
      </Card>

      {evalA.isError ? <ErrorNotice error={evalA.error} subject="the route evaluation" /> : null}
      {evalB.isError ? <ErrorNotice error={evalB.error} subject="the comparison policy" /> : null}

      {compare && evalA.data && evalB.data ? (
        <Card title="Policy comparison">
          <div className="table-wrap">
            <table>
              <caption className="sr-only">Comparison of the same request under two routing policies</caption>
              <thead><tr><th scope="col">Policy</th><th scope="col">Result</th><th scope="col">Time (min)</th><th scope="col">Distance (km)</th><th scope="col">Alternatives</th><th scope="col">Excluded segments</th></tr></thead>
              <tbody>
                {[evalA.data, evalB.data].map((p) => (
                  <tr key={p.id}>
                    <td>{POLICY_LABEL[p.policy_version as PolicyVersion] ?? p.policy_version}</td>
                    <td><StatusBadge kind="route" value={p.result_status} /></td>
                    <td>{p.result_status === "FEASIBLE" ? Math.round(p.total_duration_seconds / 60) : "—"}</td>
                    <td>{p.result_status === "FEASIBLE" ? (p.total_distance_meters / 1000).toFixed(1) : "—"}</td>
                    <td>{p.alternatives.length}</td>
                    <td>{Object.keys(p.excluded_edge_reasons).length}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="small muted">Both are snapshots of the same road status. The comparison shows how policy choices change the answer; it is not a what-if on future closures.</p>
        </Card>
      ) : null}

      {evalA.data ? <RoutePlanView plan={evalA.data} tripId={tripId} canDecide={canDecide} label={compare ? POLICY_LABEL[evalA.data.policy_version as PolicyVersion] : undefined} /> : null}
      {compare && evalB.data ? <RoutePlanView plan={evalB.data} label={POLICY_LABEL[evalB.data.policy_version as PolicyVersion]} /> : null}
      {!evalA.data && !evalA.isPending && !evalA.isError ? (
        <Banner tone="neutral" title="No route evaluated yet"><p className="small">Choose an origin, destination and vehicle weight, then evaluate.</p></Banner>
      ) : null}
    </div>
  );
}
