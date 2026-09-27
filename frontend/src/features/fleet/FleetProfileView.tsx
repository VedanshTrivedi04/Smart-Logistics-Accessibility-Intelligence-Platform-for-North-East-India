"use client";

import Link from "next/link";
import {
  User,
  Shield,
  Truck,
  Building,
  CheckCircle2,
  ExternalLink,
  Navigation,
  Compass,
  KeyRound,
  FileText,
} from "lucide-react";
import { useSession } from "@/shared/auth";
import { PageHeader, Card, Button, StatusBadge } from "@/shared/ui";
import { humanize, shortId } from "@/shared/lib/format";

export function FleetProfileView() {
  const { principal, can } = useSession();
  const role = principal?.role;

  const isFleetManager = role === "FLEET_MANAGER";
  const isDeliveryCoordinator = role === "DELIVERY_COORDINATOR";
  const isTransportOperator = role === "TRANSPORT_OPERATOR";

  return (
    <div className="stack" style={{ gap: "1.2rem" }}>
      <PageHeader
        title="Fleet Operations Profile"
        subtitle="Operational identity, role mandates, capabilities, and logistics jurisdictional scope."
        actions={
          <Link href="/account">
            <Button size="small" variant="default">
              <KeyRound size={14} style={{ marginRight: "4px" }} /> System Account &amp; Scope
            </Button>
          </Link>
        }
      />

      <div className="grid cols-2" style={{ gap: "1.2rem" }}>
        {/* Identity & Scope */}
        <Card title="Operator Identity">
          <div className="stack" style={{ gap: "0.8rem" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
              <div
                style={{
                  width: "56px",
                  height: "56px",
                  borderRadius: "50%",
                  background: "rgba(59, 130, 246, 0.1)",
                  color: "#2563eb",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "1.4rem",
                  fontWeight: 700,
                }}
              >
                {principal?.email?.charAt(0).toUpperCase() ?? "F"}
              </div>
              <div>
                <h3 style={{ margin: 0, fontSize: "1.1rem" }}>
                  {principal?.email?.split("@")[0] ?? "Fleet Operator"}
                </h3>
                <span className="small muted">{principal?.email}</span>
                <div style={{ marginTop: "4px" }}>
                  <span className="badge ok">{humanize(role ?? "FLEET_OPERATOR")}</span>
                </div>
              </div>
            </div>

            <div style={{ borderTop: "1px solid var(--border-color, #e2e8f0)", paddingTop: "0.8rem" }} className="stack">
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.85rem" }}>
                <span className="muted">Principal ID</span>
                <code>{shortId(principal?.user_id ?? "—")}</code>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.85rem" }}>
                <span className="muted">Organization ID</span>
                <code>{principal?.org_id ? shortId(principal.org_id) : "Regional Authority (Global)"}</code>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.85rem" }}>
                <span className="muted">Jurisdiction Scope</span>
                <span>{principal?.jurisdiction_ids?.[0] ? `District/State ${shortId(principal.jurisdiction_ids[0])}` : "All North-East Corridors"}</span>
              </div>
            </div>
          </div>
        </Card>

        {/* Operational Role Mandate */}
        <Card title="Operational Mandate & Role">
          <div className="stack" style={{ gap: "0.8rem" }}>
            {isFleetManager && (
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", fontWeight: 600, color: "#1e40af" }}>
                  <Shield size={16} /> Fleet Operations Manager (Hema Goswami)
                </div>
                <p className="small muted" style={{ marginTop: "0.3rem" }}>
                  Responsible for vehicles, drivers, trips, resource allocations, and operational handling of road disruptions. Coordinates alternative routes with transport drivers during network blockages.
                </p>
              </div>
            )}

            {isDeliveryCoordinator && (
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", fontWeight: 600, color: "#065f46" }}>
                  <Truck size={16} /> Delivery Logistics Coordinator (Indraneil)
                </div>
                <p className="small muted" style={{ marginTop: "0.3rem" }}>
                  Authoritatively defines delivery consignments, priorities, and deadlines. Connects commitments to trip dispatches and tracks delivery SLAs across the North-East corridor.
                </p>
              </div>
            )}

            {isTransportOperator && (
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", fontWeight: 600, color: "#92400e" }}>
                  <Navigation size={16} /> Transport Driver / Operator (Jayashree Teron)
                </div>
                <p className="small muted" style={{ marginTop: "0.3rem" }}>
                  Executes assigned trips on the ground, streams telemetry &amp; GPS position fixes, receives route diversion instructions, and reports stop completions.
                </p>
                <div style={{ marginTop: "0.8rem" }}>
                  <Link href="/logistics/operator">
                    <Button variant="primary" size="small">
                      <Compass size={14} style={{ marginRight: "4px" }} /> Open Driver Cockpit
                    </Button>
                  </Link>
                </div>
              </div>
            )}

            {!isFleetManager && !isDeliveryCoordinator && !isTransportOperator && (
              <div>
                <span className="small muted">
                  Your active role is authorized to inspect fleet telemetry and logistics records.
                </span>
              </div>
            )}

            <div style={{ borderTop: "1px dashed var(--border-color, #e2e8f0)", paddingTop: "0.8rem" }}>
              <span className="small" style={{ fontWeight: 600, display: "block", marginBottom: "0.4rem" }}>
                Active Capabilities:
              </span>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem" }}>
                {can("VIEW_FLEET") && <span className="badge ok">VIEW_FLEET</span>}
                {can("DISPATCH_ROUTE") && <span className="badge ok">DISPATCH_ROUTE</span>}
                {can("VIEW_IMPACT") && <span className="badge ok">VIEW_IMPACT</span>}
                {can("COORDINATE_RESPONSE") && <span className="badge ok">COORDINATE_RESPONSE</span>}
                {can("SUBMIT_GPS") && <span className="badge ok">SUBMIT_GPS</span>}
                {can("VIEW_DRIVER_PII") && <span className="badge ok">VIEW_DRIVER_PII</span>}
              </div>
            </div>
          </div>
        </Card>
      </div>

      {/* Quick Navigation Cards */}
      <div className="grid cols-3" style={{ gap: "1rem" }}>
        <Link href="/logistics/vehicles" style={{ textDecoration: "none", color: "inherit" }}>
          <Card title="Vehicles Directory">
            <p className="small muted" style={{ margin: 0 }}>
              Inspect registered trucks, vans, payloads, and maintenance statuses.
            </p>
          </Card>
        </Link>
        <Link href="/logistics/trips" style={{ textDecoration: "none", color: "inherit" }}>
          <Card title="Trips Schedule">
            <p className="small muted" style={{ margin: 0 }}>
              Monitor active en-route trips, route itineraries, and live ETAs.
            </p>
          </Card>
        </Link>
        <Link href="/logistics/disruptions" style={{ textDecoration: "none", color: "inherit" }}>
          <Card title="Disruption Desk">
            <p className="small muted" style={{ margin: 0 }}>
              Review real-time road closures and coordinate alternative routing.
            </p>
          </Card>
        </Link>
      </div>
    </div>
  );
}
