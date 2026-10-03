"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useSession } from "@/shared/auth";
import { formatDateTime } from "@/shared/lib/time";
import { humanize, shortId } from "@/shared/lib/format";
import { Banner, Button, Card, KeyValue, QueryState, StatusBadge, Tabs } from "@/shared/ui";
import { useDrivers, useTrips, useVehicles } from "./queries";
import { DeliveryHistory } from "./TripViews";

type DriverTab = "overview" | "trip" | "history";

const DRIVER_TABS: ReadonlyArray<{ id: DriverTab; label: string }> = [
  { id: "overview", label: "Driver Dossier" },
  { id: "trip", label: "Current Trip" },
  { id: "history", label: "Assignment History" },
];

export function DriverDetail({ driverId, driverBase = "/logistics/drivers", tripBase = "/logistics/trips", vehicleBase = "/logistics/vehicles" }: { driverId: string; driverBase?: string; tripBase?: string; vehicleBase?: string }) {
  const [tab, setTab] = useState<DriverTab>("overview");
  const { can } = useSession();
  const drivers = useDrivers();
  const trips = useTrips();
  const vehicles = useVehicles();

  const driver = drivers.data?.find((d) => d.id === driverId);
  const driverTrips = useMemo(() => {
    return (trips.data ?? []).filter((t) => t.driver_id === driverId);
  }, [trips.data, driverId]);

  const activeTrip = driverTrips.find((t) =>
    ["DISPATCHED", "IN_TRANSIT", "HELD_FOR_INSPECTION", "DIVERTED"].includes(t.status),
  );

  const assignedVehicle = activeTrip ? vehicles.data?.find((v) => v.id === activeTrip.vehicle_id) : null;

  return (
    <QueryState query={drivers} subject="driver">
      {() =>
        !driver ? (
          <Banner tone="warn" title="Driver not found">
            <p className="small">No driver record with this ID in your organization scope.</p>
          </Banner>
        ) : (
          <div className="stack" style={{ gap: "1.25rem" }}>
            {/* Header Card */}
            <Card title={driver.full_name}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "1rem" }}>
                <div>
                  <div style={{ fontSize: "1.1rem", fontWeight: 700 }}>
                    License: {driver.license_number}
                  </div>
                  <div className="small muted">
                    Classes: {driver.license_classes.join(", ") || "Heavy Transport / Commercial"} · {driverTrips.length} recorded trip{driverTrips.length === 1 ? "" : "s"}
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                  {activeTrip ? (
                    <span className="badge tone-info">On Trip: {activeTrip.trip_code}</span>
                  ) : driver.is_active ? (
                    <span className="badge tone-ok">Available for Assignment</span>
                  ) : (
                    <span className="badge tone-warn">Inactive</span>
                  )}
                </div>
              </div>
            </Card>

            {/* Navigation Tabs */}
            <Tabs tabs={DRIVER_TABS} value={tab} onChange={setTab} label="Driver sections" />

            {/* Tab 1: Overview */}
            {tab === "overview" && (
              <div className="split">
                <Card title="Official Credentials">
                  <KeyValue
                    items={[
                      ["Full Name", driver.full_name],
                      ["License Number", driver.license_number],
                      ["License Classes", driver.license_classes.join(", ") || "Heavy Vehicle, Transport"],
                      [
                        "Contact Phone",
                        can("VIEW_DRIVER_PII") ? (
                          driver.phone_e164 || "Not provided"
                        ) : (
                          <span className="small muted">Restricted by PII Access Policy</span>
                        ),
                      ],
                      ["Roster Status", driver.is_active ? "Active & Authorized" : "Inactive / On Leave"],
                      ["Total Assigned Trips", String(driverTrips.length)],
                    ]}
                  />
                </Card>
                <div className="stack">
                  <Card title="Operational Status">
                    {activeTrip ? (
                      <div className="stack" style={{ gap: "0.5rem" }}>
                        <div className="row">
                          <span className="small muted">Assigned Trip:</span>
                          <Link href={`${tripBase}/${activeTrip.id}`} style={{ fontWeight: 600 }}>
                            {activeTrip.trip_code}
                          </Link>
                          <StatusBadge kind="trip" value={activeTrip.status} />
                        </div>
                        {assignedVehicle && (
                          <div className="row">
                            <span className="small muted">Vehicle:</span>
                            <Link href={`${vehicleBase}/${assignedVehicle.id}`}>
                              {assignedVehicle.registration_number} ({assignedVehicle.make_model})
                            </Link>
                          </div>
                        )}
                        <p className="small muted">
                          Departure: {formatDateTime(activeTrip.scheduled_departure)}
                        </p>
                        <Link href={`${tripBase}/${activeTrip.id}`}>
                          <Button size="small">Inspect Trip Details →</Button>
                        </Link>
                      </div>
                    ) : (
                      <p className="muted">This driver is currently idle and available for new trip assignments.</p>
                    )}
                  </Card>
                </div>
              </div>
            )}

            {/* Tab 2: Current Trip */}
            {tab === "trip" && (
              <Card title="Current Assigned Trip">
                {activeTrip ? (
                  <div className="stack" style={{ gap: "1rem" }}>
                    <div className="row">
                      <h3 style={{ margin: 0 }}>Trip {activeTrip.trip_code}</h3>
                      <StatusBadge kind="trip" value={activeTrip.status} />
                    </div>
                    <KeyValue
                      items={[
                        ["Scheduled Departure", formatDateTime(activeTrip.scheduled_departure)],
                        ["Actual Departure", activeTrip.actual_departure ? formatDateTime(activeTrip.actual_departure) : "Not departed yet"],
                        ["Assigned Vehicle", assignedVehicle ? assignedVehicle.registration_number : shortId(activeTrip.vehicle_id)],
                        ["Stops Count", String(activeTrip.stops.length)],
                        ["Consignments", `${activeTrip.commitment_ids.length} linked delivery item(s)`],
                      ]}
                    />
                    <Link href={`${tripBase}/${activeTrip.id}`}>
                      <Button variant="primary">Go to Full Trip Cockpit & Route →</Button>
                    </Link>
                  </div>
                ) : (
                  <p className="muted">No active trip currently in-flight for this driver.</p>
                )}
              </Card>
            )}

            {/* Tab 3: History */}
            {tab === "history" && (
              <DeliveryHistory tripBase={tripBase} driverId={driverId} />
            )}
          </div>
        )
      }
    </QueryState>
  );
}
