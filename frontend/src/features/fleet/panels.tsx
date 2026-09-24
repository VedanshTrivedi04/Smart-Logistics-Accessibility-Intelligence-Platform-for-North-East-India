"use client";

import Link from "next/link";
import type { Trip, Vehicle, VehiclePosition } from "@/shared/api";
import { useSession } from "@/shared/auth";
import { humanize } from "@/shared/lib/format";
import { Banner, Button, Card, KeyValue, SourceAge, StatusBadge } from "@/shared/ui";
import { describeGps } from "./gps";

interface VehiclePanelProps {
  vehicle: Vehicle;
  /** undefined while loading; null when the platform has never received a fix. */
  position: VehiclePosition | null | undefined;
  activeTrip: Trip | null;
  now: Date;
  vehicleBase: string;
  tripBase: string;
  /** When set (and the role allows it), a "Plan a route from here" link appears, using the vehicle's last GPS fix as origin. */
  routeBase?: string;
  onClose?: () => void;
}

/** Quick vehicle detail shown beside the fleet map when a marker or table row is selected. */
export function VehiclePanel({ vehicle, position, activeTrip, now, vehicleBase, tripBase, routeBase, onClose }: VehiclePanelProps) {
  const { can } = useSession();
  const gps = describeGps(position, now);
  return (
    <Card title={vehicle.registration_number} actions={onClose ? <Button size="small" onClick={onClose}>Close</Button> : undefined}>
      <div className="stack">
        <div className="row">
          {position ? <StatusBadge kind="gps" value={position.stale_status} /> : position === null ? <span className="badge tone-unknown">No fix yet</span> : <span className="muted small">Checking…</span>}
          {vehicle.is_active ? null : <span className="badge tone-neutral">Inactive</span>}
        </div>
        <p className="small">{gps.statement}</p>
        <KeyValue
          items={[
            ["Type", humanize(vehicle.vehicle_type)],
            ["Make / model", vehicle.make_model],
            ["Hazmat capable", vehicle.is_hazmat_capable ? "Yes" : "No"],
            ["Refrigerated", vehicle.is_refrigerated ? "Yes" : "No"],
            ...(position ? ([
              ["Position", `${position.lat.toFixed(5)}, ${position.lon.toFixed(5)}`],
              ["Speed / heading", `${position.speed_kph.toFixed(0)} km/h · ${position.heading_deg.toFixed(0)}°`],
            ] as Array<[string, string]>) : []),
          ]}
        />
        {position ? (
          <p className="small muted"><SourceAge observedAt={position.event_at} receivedAt={position.received_at} subject="Fix taken" /></p>
        ) : (
          <Banner tone="caution" title="No GPS position received"><p className="small">The platform has never received a fix for this vehicle.</p></Banner>
        )}
        {position && routeBase && can("COMPUTE_ROUTE") ? (
          <p className="small"><Link href={`${routeBase}?originLat=${position.lat}&originLon=${position.lon}&vehicleId=${vehicle.id}`}>Plan a route from here →</Link></p>
        ) : null}
        {activeTrip ? (
          <div>
            <h3>Current trip</h3>
            <div className="row"><Link href={`${tripBase}/${activeTrip.id}`}>{activeTrip.trip_code}</Link><StatusBadge kind="trip" value={activeTrip.status} /></div>
            <p className="small muted">{activeTrip.stops.length} stops · {activeTrip.commitment_ids.length} consignment(s)</p>
          </div>
        ) : (
          <p className="small muted">No active trip assigned to this vehicle.</p>
        )}
        <p className="small"><Link href={`${vehicleBase}/${vehicle.id}`}>Open full vehicle detail (GPS trail, breadcrumbs)</Link></p>
      </div>
    </Card>
  );
}
