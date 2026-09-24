"use client";

import { useMemo, useState, type FormEvent } from "react";
import { POLICY_VERSIONS, PRIORITY_TIERS, type Facility, type PolicyVersion, type PriorityTier, type RoutePlan } from "@/shared/api";
import { humanize } from "@/shared/lib/format";
import { bboxOfCoordinates, isValidLatLon } from "@/shared/lib/geo";
import { MapLegend, MapView, type MapPoint } from "@/shared/map";
import { Banner, Button, Card, ErrorNotice, Field, StatusBadge } from "@/shared/ui";
import { AddressSearch, type GeocodeResult } from "./AddressSearch";
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
  /** Fixed endpoints (used from a trip page, or handed in from a map "plan a route" link). */
  initial?: { originFacilityId?: string; destinationFacilityId?: string; originLat?: number; originLon?: number; vehicleId?: string; maxWeightKg?: number; priority?: PriorityTier };
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

/** The endpoint's lon/lat for map display, or null while it cannot be resolved yet. */
function endLonLat(end: End, facilities: readonly Facility[]): [number, number] | null {
  if (end.kind === "facility") {
    const f = facilities.find((x) => x.id === end.facilityId);
    return f ? [f.lon, f.lat] : null;
  }
  const lat = Number(end.lat);
  const lon = Number(end.lon);
  return isValidLatLon(lat, lon) ? [lon, lat] : null;
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
  const [origin, setOrigin] = useState<End>(
    initial?.originLat !== undefined && initial?.originLon !== undefined
      ? { kind: "coords", facilityId: "", lat: String(initial.originLat), lon: String(initial.originLon) }
      : { kind: "facility", facilityId: initial?.originFacilityId ?? "", lat: "", lon: "" },
  );
  const [dest, setDest] = useState<End>({ kind: "facility", facilityId: initial?.destinationFacilityId ?? "", lat: "", lon: "" });
  const [vehicleId, setVehicleId] = useState(initial?.vehicleId ?? "");
  const [weight, setWeight] = useState(initial?.maxWeightKg ? String(initial.maxWeightKg) : "");
  const [height, setHeight] = useState("");
  const [hazmat, setHazmat] = useState(false);
  const [priority, setPriority] = useState<PriorityTier>(initial?.priority ?? "TIER_3_STANDARD");
  const [policy, setPolicy] = useState<PolicyVersion>("CONSERVATIVE_CRITICAL_V1");
  const [error, setError] = useState<string | null>(null);
  const [pickMode, setPickMode] = useState<"origin" | "destination" | null>(null);

  const pickVehicle = (id: string) => {
    setVehicleId(id);
    const v = vehicles.find((x) => x.id === id);
    if (v) {
      setWeight(String(v.maxWeightKg));
      setHeight(String(v.heightM));
      setHazmat(v.hazmatCapable ? hazmat : false);
    }
  };

  const originLonLat = endLonLat(origin, facilities);
  const destLonLat = endLonLat(dest, facilities);
  const mapPoints = useMemo<MapPoint[]>(
    () => [
      ...facilities.map((f) => ({ id: `facility:${f.id}`, kind: "facility" as const, lon: f.lon, lat: f.lat, label: `${f.name} (${humanize(f.kind)})`, tone: "neutral" as const })),
      ...(originLonLat ? [{ id: "origin", kind: "stop" as const, lon: originLonLat[0], lat: originLonLat[1], label: "Origin", tone: "ok" as const, glyph: "A" }] : []),
      ...(destLonLat ? [{ id: "destination", kind: "stop" as const, lon: destLonLat[0], lat: destLonLat[1], label: "Destination", tone: "danger" as const, glyph: "B" }] : []),
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [facilities, originLonLat?.[0], originLonLat?.[1], destLonLat?.[0], destLonLat?.[1]],
  );
  const bothSet = originLonLat && destLonLat;
  const mapFitBounds = bothSet ? bboxOfCoordinates([originLonLat, destLonLat]) : null;
  const mapFitKey = bothSet ? `${originLonLat.join(",")}-${destLonLat.join(",")}` : "none";

  const handlePickClick = (lon: number, lat: number) => {
    if (!pickMode) return;
    const value = { facilityId: "", lat: lat.toFixed(5), lon: lon.toFixed(5) };
    if (pickMode === "origin") setOrigin({ kind: "coords", ...value });
    else setDest({ kind: "coords", ...value });
    setPickMode(null);
  };

  const handlePickFacility = (id: string) => {
    if (!pickMode || !id.startsWith("facility:")) return;
    const value: End = { kind: "facility", facilityId: id.replace("facility:", ""), lat: "", lon: "" };
    if (pickMode === "origin") setOrigin(value);
    else setDest(value);
    setPickMode(null);
  };

  const handleSearchSelect = (target: "origin" | "destination", result: GeocodeResult) => {
    const value: End = { kind: "coords", facilityId: "", lat: result.lat.toFixed(5), lon: result.lon.toFixed(5) };
    if (target === "origin") setOrigin(value);
    else setDest(value);
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
      <Card title="Pick origin and destination on the map (optional)">
        <div className="grid cols-2" style={{ marginBottom: "0.5rem" }}>
          <AddressSearch id="rv-search-origin" label="Search for an origin place" onSelect={(r) => handleSearchSelect("origin", r)} />
          <AddressSearch id="rv-search-dest" label="Search for a destination place" onSelect={(r) => handleSearchSelect("destination", r)} />
        </div>
        <div className="row" style={{ marginBottom: "0.5rem" }}>
          <Button size="small" variant={pickMode === "origin" ? "primary" : "default"} onClick={() => setPickMode((m) => (m === "origin" ? null : "origin"))}>
            {pickMode === "origin" ? "Click the map to set origin…" : "Pick origin on map"}
          </Button>
          <Button size="small" variant={pickMode === "destination" ? "primary" : "default"} onClick={() => setPickMode((m) => (m === "destination" ? null : "destination"))}>
            {pickMode === "destination" ? "Click the map to set destination…" : "Pick destination on map"}
          </Button>
        </div>
        <MapView
          ariaLabel="Pick a route origin and destination"
          height={320}
          points={mapPoints}
          onMapClick={handlePickClick}
          onSelectPoint={handlePickFacility}
          fitBounds={mapFitBounds}
          fitKey={mapFitKey}
        />
        <MapLegend points={mapPoints} />
        <p className="small muted">With a pick mode active, click a facility marker or an empty spot on the map. The fields below update to match, and still work on their own.</p>
      </Card>
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
