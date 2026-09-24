"use client";

import { useState, type FormEvent } from "react";
import { CARGO_CATEGORIES, PRIORITY_TIERS, STOP_TYPES, VEHICLE_TYPES, type CargoCategory, type PriorityTier, type StopType, type VehicleType } from "@/shared/api";
import { useSession } from "@/shared/auth";
import { humanize } from "@/shared/lib/format";
import { Banner, Button, Card, CapabilityNotice, ErrorNotice, Field, useAnnounce } from "@/shared/ui";
import { FacilitySelect, useFacilities } from "@/features/network";
import { useCommitments, useCreateCommitment, useCreateDriver, useCreateVehicle, useDispatchTrip, useDrivers, useVehicles } from "./queries";

const num = (s: string) => (s.trim() === "" ? NaN : Number(s));

function CreateVehicleForm() {
  const create = useCreateVehicle();
  const announce = useAnnounce();
  const [f, setF] = useState({ reg: "", type: "TRUCK_MEDIUM" as VehicleType, model: "", max: "", empty: "", h: "", w: "", l: "", axles: "2", hazmat: false, fridge: false });
  const [error, setError] = useState<string | null>(null);
  const set = (patch: Partial<typeof f>) => setF((p) => ({ ...p, ...patch }));
  const submit = (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    const values = [f.max, f.empty, f.h, f.w, f.l].map(num);
    if (!f.reg.trim() || !f.model.trim()) return setError("Registration and make/model are required.");
    if (values.some((v) => !(v > 0))) return setError("Weights and dimensions must be positive numbers.");
    if ((values[1] as number) >= (values[0] as number)) return setError("Empty weight must be less than maximum weight.");
    create.mutate(
      { registration_number: f.reg.trim(), vehicle_type: f.type, make_model: f.model.trim(), max_weight_kg: values[0] as number, empty_weight_kg: values[1] as number, height_m: values[2] as number, width_m: values[3] as number, length_m: values[4] as number, axle_count: Number(f.axles) || 2, is_hazmat_capable: f.hazmat, is_refrigerated: f.fridge },
      { onSuccess: () => { announce("Vehicle registered"); setF((p) => ({ ...p, reg: "", model: "" })); } },
    );
  };
  return (
    <Card title="Register a vehicle">
      <form className="stack" onSubmit={submit}>
        <div className="grid cols-2">
          <Field label="Registration number" htmlFor="v-reg"><input id="v-reg" value={f.reg} onChange={(e) => set({ reg: e.target.value })} /></Field>
          <Field label="Type" htmlFor="v-type"><select id="v-type" value={f.type} onChange={(e) => set({ type: e.target.value as VehicleType })}>{VEHICLE_TYPES.map((t) => <option key={t} value={t}>{humanize(t)}</option>)}</select></Field>
          <Field label="Make / model" htmlFor="v-model"><input id="v-model" value={f.model} onChange={(e) => set({ model: e.target.value })} /></Field>
          <Field label="Axles" htmlFor="v-axles"><input id="v-axles" inputMode="numeric" value={f.axles} onChange={(e) => set({ axles: e.target.value })} /></Field>
          <Field label="Max weight (kg)" htmlFor="v-max"><input id="v-max" inputMode="decimal" value={f.max} onChange={(e) => set({ max: e.target.value })} /></Field>
          <Field label="Empty weight (kg)" htmlFor="v-empty"><input id="v-empty" inputMode="decimal" value={f.empty} onChange={(e) => set({ empty: e.target.value })} /></Field>
          <Field label="Height (m)" htmlFor="v-h"><input id="v-h" inputMode="decimal" value={f.h} onChange={(e) => set({ h: e.target.value })} /></Field>
          <Field label="Width (m)" htmlFor="v-w"><input id="v-w" inputMode="decimal" value={f.w} onChange={(e) => set({ w: e.target.value })} /></Field>
          <Field label="Length (m)" htmlFor="v-l"><input id="v-l" inputMode="decimal" value={f.l} onChange={(e) => set({ l: e.target.value })} /></Field>
        </div>
        <div className="row">
          <label className="row"><input type="checkbox" checked={f.hazmat} onChange={(e) => set({ hazmat: e.target.checked })} /> Hazmat capable</label>
          <label className="row"><input type="checkbox" checked={f.fridge} onChange={(e) => set({ fridge: e.target.checked })} /> Refrigerated</label>
        </div>
        {error ? <p className="error" role="alert">{error}</p> : null}
        {create.isError ? <ErrorNotice error={create.error} subject="this vehicle" /> : null}
        {create.isSuccess ? <Banner tone="ok" title={`Registered ${create.data.registration_number}`} /> : null}
        <Button type="submit" variant="primary" busy={create.isPending}>Register vehicle</Button>
      </form>
    </Card>
  );
}

function CreateDriverForm() {
  const create = useCreateDriver();
  const [f, setF] = useState({ name: "", phone: "", license: "", classes: "" });
  const [error, setError] = useState<string | null>(null);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!/^\+[1-9]\d{6,14}$/.test(f.phone.trim())) return setError("Phone must be in international format, for example +91… (E.164).");
    if (!f.name.trim() || !f.license.trim()) return setError("Name and licence number are required.");
    create.mutate({ full_name: f.name.trim(), phone_e164: f.phone.trim(), license_number: f.license.trim(), license_classes: f.classes.split(",").map((s) => s.trim()).filter(Boolean) }, { onSuccess: () => setF({ name: "", phone: "", license: "", classes: "" }) });
  };
  return (
    <Card title="Register a driver">
      <form className="stack" onSubmit={submit}>
        <div className="grid cols-2">
          <Field label="Full name" htmlFor="d-name"><input id="d-name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
          <Field label="Phone (E.164)" htmlFor="d-phone"><input id="d-phone" inputMode="tel" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></Field>
          <Field label="Licence number" htmlFor="d-lic"><input id="d-lic" value={f.license} onChange={(e) => setF({ ...f, license: e.target.value })} /></Field>
          <Field label="Licence classes (comma separated)" htmlFor="d-cls"><input id="d-cls" value={f.classes} onChange={(e) => setF({ ...f, classes: e.target.value })} /></Field>
        </div>
        {error ? <p className="error" role="alert">{error}</p> : null}
        {create.isError ? <ErrorNotice error={create.error} subject="this driver" /> : null}
        {create.isSuccess ? <Banner tone="ok" title="Driver registered" /> : null}
        <Button type="submit" variant="primary" busy={create.isPending}>Register driver</Button>
      </form>
    </Card>
  );
}

function CreateCommitmentForm() {
  const create = useCreateCommitment();
  const [f, setF] = useState({ ref: "", cat: "GENERAL_SUPPLIES" as CargoCategory, tier: "TIER_3_STANDARD" as PriorityTier, kg: "", units: "", origin: "", dest: "", by: "" });
  const [error, setError] = useState<string | null>(null);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!f.ref.trim() || !f.origin || !f.dest || !f.by) return setError("Reference, origin, destination and deadline are required.");
    if (f.origin === f.dest) return setError("Origin and destination must differ.");
    if (!(num(f.kg) > 0) || !(Number(f.units) >= 1)) return setError("Weight and quantity must be positive.");
    create.mutate({ consignment_reference: f.ref.trim(), cargo_category: f.cat, priority_tier: f.tier, consigned_weight_kg: num(f.kg), consigned_quantity_units: Math.floor(Number(f.units)), origin_facility_id: f.origin, destination_facility_id: f.dest, required_before: new Date(f.by).toISOString() }, { onSuccess: () => setF((p) => ({ ...p, ref: "" })) });
  };
  return (
    <Card title="Record a consignment">
      <form className="stack" onSubmit={submit}>
        <div className="grid cols-2">
          <Field label="Reference" htmlFor="c-ref"><input id="c-ref" value={f.ref} onChange={(e) => setF({ ...f, ref: e.target.value })} /></Field>
          <Field label="Cargo category" htmlFor="c-cat"><select id="c-cat" value={f.cat} onChange={(e) => setF({ ...f, cat: e.target.value as CargoCategory })}>{CARGO_CATEGORIES.map((c) => <option key={c} value={c}>{humanize(c)}</option>)}</select></Field>
          <Field label="Priority" htmlFor="c-tier"><select id="c-tier" value={f.tier} onChange={(e) => setF({ ...f, tier: e.target.value as PriorityTier })}>{PRIORITY_TIERS.map((c) => <option key={c} value={c}>{humanize(c)}</option>)}</select></Field>
          <Field label="Deadline" htmlFor="c-by"><input id="c-by" type="datetime-local" value={f.by} onChange={(e) => setF({ ...f, by: e.target.value })} /></Field>
          <Field label="Weight (kg)" htmlFor="c-kg"><input id="c-kg" inputMode="decimal" value={f.kg} onChange={(e) => setF({ ...f, kg: e.target.value })} /></Field>
          <Field label="Quantity (units)" htmlFor="c-units"><input id="c-units" inputMode="numeric" value={f.units} onChange={(e) => setF({ ...f, units: e.target.value })} /></Field>
          <Field label="Origin facility" htmlFor="c-o"><FacilitySelect id="c-o" value={f.origin} onChange={(v) => setF({ ...f, origin: v })} /></Field>
          <Field label="Destination facility" htmlFor="c-d"><FacilitySelect id="c-d" value={f.dest} onChange={(v) => setF({ ...f, dest: v })} /></Field>
        </div>
        {error ? <p className="error" role="alert">{error}</p> : null}
        {create.isError ? <ErrorNotice error={create.error} subject="this consignment" /> : null}
        {create.isSuccess ? <Banner tone="ok" title="Consignment recorded" /> : null}
        <Button type="submit" variant="primary" busy={create.isPending}>Record consignment</Button>
      </form>
    </Card>
  );
}

interface StopDraft { type: StopType; facilityId: string; arrive: string; depart: string }

function DispatchTripForm() {
  const create = useDispatchTrip();
  const vehicles = useVehicles();
  const drivers = useDrivers();
  const facilities = useFacilities();
  const pending = useCommitments("PENDING");
  const [f, setF] = useState({ code: "", vehicle: "", driver: "", depart: "" });
  const [stops, setStops] = useState<StopDraft[]>([{ type: "PICKUP", facilityId: "", arrive: "", depart: "" }, { type: "DELIVERY", facilityId: "", arrive: "", depart: "" }]);
  const [picked, setPicked] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const setStop = (i: number, patch: Partial<StopDraft>) => setStops((s) => s.map((x, j) => (j === i ? { ...x, ...patch } : x)));

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!f.code.trim() || !f.vehicle || !f.driver || !f.depart) return setError("Trip code, vehicle, driver and departure are required.");
    const resolved = [];
    for (const [i, s] of stops.entries()) {
      const fac = facilities.data?.find((x) => x.id === s.facilityId);
      if (!fac || !s.arrive || !s.depart) return setError(`Stop ${i + 1}: choose a facility and planned times.`);
      if (new Date(s.depart) < new Date(s.arrive)) return setError(`Stop ${i + 1}: departure is before arrival.`);
      resolved.push({ stop_type: s.type, facility_id: fac.id, lat: fac.lat, lon: fac.lon, planned_arrival: new Date(s.arrive).toISOString(), planned_departure: new Date(s.depart).toISOString() });
    }
    create.mutate({ vehicle_id: f.vehicle, driver_id: f.driver, trip_code: f.code.trim(), scheduled_departure: new Date(f.depart).toISOString(), commitment_ids: picked, stops: resolved });
  };

  return (
    <Card title="Plan a trip">
      <form className="stack" onSubmit={submit}>
        <div className="grid cols-2">
          <Field label="Trip code" htmlFor="t-code"><input id="t-code" value={f.code} onChange={(e) => setF({ ...f, code: e.target.value })} /></Field>
          <Field label="Scheduled departure" htmlFor="t-dep"><input id="t-dep" type="datetime-local" value={f.depart} onChange={(e) => setF({ ...f, depart: e.target.value })} /></Field>
          <Field label="Vehicle" htmlFor="t-veh"><select id="t-veh" value={f.vehicle} onChange={(e) => setF({ ...f, vehicle: e.target.value })}><option value="">Select</option>{(vehicles.data ?? []).filter((v) => v.is_active).map((v) => <option key={v.id} value={v.id}>{v.registration_number}</option>)}</select></Field>
          <Field label="Driver" htmlFor="t-drv"><select id="t-drv" value={f.driver} onChange={(e) => setF({ ...f, driver: e.target.value })}><option value="">Select</option>{(drivers.data ?? []).filter((d) => d.is_active).map((d) => <option key={d.id} value={d.id}>{d.full_name}</option>)}</select></Field>
        </div>
        <fieldset>
          <legend>Stops</legend>
          <div className="stack">
            {stops.map((s, i) => (
              <div key={i} className="grid cols-4">
                <Field label={`Stop ${i + 1} type`} htmlFor={`s-t-${i}`}><select id={`s-t-${i}`} value={s.type} onChange={(e) => setStop(i, { type: e.target.value as StopType })}>{STOP_TYPES.map((t) => <option key={t} value={t}>{humanize(t)}</option>)}</select></Field>
                <Field label="Facility" htmlFor={`s-f-${i}`}><FacilitySelect id={`s-f-${i}`} value={s.facilityId} onChange={(v) => setStop(i, { facilityId: v })} /></Field>
                <Field label="Planned arrival" htmlFor={`s-a-${i}`}><input id={`s-a-${i}`} type="datetime-local" value={s.arrive} onChange={(e) => setStop(i, { arrive: e.target.value })} /></Field>
                <Field label="Planned departure" htmlFor={`s-d-${i}`}><input id={`s-d-${i}`} type="datetime-local" value={s.depart} onChange={(e) => setStop(i, { depart: e.target.value })} /></Field>
              </div>
            ))}
            <div className="row">
              <Button size="small" onClick={() => setStops((s) => [...s.slice(0, -1), { type: "WAYPOINT", facilityId: "", arrive: "", depart: "" }, ...s.slice(-1)])}>Add waypoint</Button>
              {stops.length > 2 ? <Button size="small" onClick={() => setStops((s) => [...s.slice(0, -2), ...s.slice(-1)])}>Remove last waypoint</Button> : null}
            </div>
          </div>
        </fieldset>
        <fieldset>
          <legend>Consignments to carry (pending)</legend>
          {pending.data?.length ? pending.data.map((c) => (
            <label key={c.id} className="row"><input type="checkbox" checked={picked.includes(c.id)} onChange={(e) => setPicked((p) => (e.target.checked ? [...p, c.id] : p.filter((x) => x !== c.id)))} />{c.consignment_reference} <span className="small muted">{humanize(c.priority_tier)}</span></label>
          )) : <p className="small muted">No pending consignments.</p>}
        </fieldset>
        {error ? <p className="error" role="alert">{error}</p> : null}
        {create.isError ? <ErrorNotice error={create.error} subject="this trip" /> : null}
        {create.isSuccess ? <Banner tone="ok" title={`Trip ${create.data.trip_code} planned`}><p className="small">Evaluate its route from the trip page before dispatching.</p></Banner> : null}
        <Button type="submit" variant="primary" busy={create.isPending}>Create trip</Button>
      </form>
    </Card>
  );
}

export function FleetManagement() {
  const { can } = useSession();
  return (
    <div className="stack">
      {can("VIEW_FLEET") ? <><CreateVehicleForm /><CreateDriverForm /></> : <CapabilityNotice what="Registering vehicles and drivers" />}
      {can("DISPATCH_ROUTE") ? <><CreateCommitmentForm /><DispatchTripForm /></> : <CapabilityNotice what="Creating consignments and trips" />}
    </div>
  );
}

export function DriverList() {
  const drivers = useDrivers();
  return (
    <Card title="Drivers">
      {drivers.isPending ? <p role="status" className="muted">Loading drivers…</p> : drivers.isError ? <ErrorNotice error={drivers.error} subject="drivers" /> : drivers.data.length === 0 ? <p className="muted">No drivers registered.</p> : (
        <div className="table-wrap"><table><caption className="sr-only">Drivers</caption><thead><tr><th scope="col">Name</th><th scope="col">Phone</th><th scope="col">Licence</th><th scope="col">Record</th></tr></thead><tbody>
          {drivers.data.map((d) => <tr key={d.id}><td>{d.full_name}</td><td>{d.phone_e164}</td><td>{d.license_number} <span className="small muted">{d.license_classes.join(", ")}</span></td><td>{d.is_active ? "Active" : "Inactive"}</td></tr>)}
        </tbody></table></div>
      )}
      <p className="small muted">Personal details are shown only when your role is allowed to see them; the server decides what is returned.</p>
    </Card>
  );
}
