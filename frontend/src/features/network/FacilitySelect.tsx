"use client";

import { useFacilities } from "./queries";
import { facilityLabel } from "./panels";

interface Props {
  id: string;
  value: string;
  onChange: (facilityId: string) => void;
  required?: boolean;
  allowEmpty?: string;
}

/** Facility picker backed by the real registry. Empty registry is stated, not papered over. */
export function FacilitySelect({ id, value, onChange, required, allowEmpty }: Props) {
  const q = useFacilities();
  if (q.isPending) return <select id={id} disabled><option>Loading facilities…</option></select>;
  if (q.isError) return <p className="error" role="alert">Facilities could not be loaded. Retry from the page menu.</p>;
  if (q.data.length === 0) return <p className="muted small">No facilities are registered in your scope yet.</p>;
  return (
    <select id={id} value={value} onChange={(e) => onChange(e.target.value)} required={required}>
      <option value="">{allowEmpty ?? "Select a facility"}</option>
      {q.data.map((f) => (
        <option key={f.id} value={f.id}>{facilityLabel(f)}</option>
      ))}
    </select>
  );
}
