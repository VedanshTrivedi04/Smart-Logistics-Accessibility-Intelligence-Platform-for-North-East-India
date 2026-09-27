"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  Activity,
  Truck,
  MessageSquare,
  Package,
  Calendar,
  Filter,
  CheckCircle2,
  Clock,
  ExternalLink,
  ShieldCheck,
} from "lucide-react";
import { useSession } from "@/shared/auth";
import { useTrips, useCommitments } from "./queries";
import { useCoordinationSummaries } from "@/features/coordination/queries";
import { PageHeader, Card, Button, StatusBadge } from "@/shared/ui";
import { humanize, shortId } from "@/shared/lib/format";

type ActivityCategory = "ALL" | "TRIPS" | "COORDINATION" | "CONSIGNMENTS";

interface ActivityItem {
  id: string;
  category: "TRIP" | "COORDINATION" | "CONSIGNMENT";
  title: string;
  detail: string;
  timestamp: string;
  actor?: string;
  linkHref?: string;
  badgeText?: string;
  badgeTone?: "ok" | "warn" | "danger" | "neutral";
}

export function FleetActivityView() {
  const { can } = useSession();
  const [filter, setFilter] = useState<ActivityCategory>("ALL");

  const tripsQuery = useTrips();
  const commitmentsQuery = useCommitments();
  const coordinationQuery = useCoordinationSummaries();

  const activityFeed = useMemo<ActivityItem[]>(() => {
    const items: ActivityItem[] = [];

    // Trips activity
    for (const t of tripsQuery.data ?? []) {
      items.push({
        id: `trip-${t.id}-${t.status}`,
        category: "TRIP",
        title: `Trip ${t.trip_code} · ${humanize(t.status)}`,
        detail: `Vehicle ID: ${shortId(t.vehicle_id)} | Driver ID: ${shortId(t.driver_id)} | ${t.commitment_ids.length} consignments`,
        timestamp: t.created_at ?? t.scheduled_departure,
        linkHref: `/logistics/trips/${t.id}`,
        badgeText: t.status,
        badgeTone: t.status === "COMPLETED" ? "ok" : t.status === "IN_TRANSIT" ? "warn" : "neutral",
      });
    }

    // Coordination actions
    for (const summary of coordinationQuery.data ?? []) {
      for (const a of summary.actions) {
        items.push({
          id: `coord-${a.id}`,
          category: "COORDINATION",
          title: `Operational Directive: ${humanize(a.action)}`,
          detail: a.notes ?? "No details provided",
          timestamp: a.created_at,
          actor: a.actor_id,
          linkHref: a.subject_type === "TRIP" ? `/logistics/trips/${a.subject_ref}` : undefined,
          badgeText: humanize(a.action),
          badgeTone: "warn",
        });
      }
    }

    // Consignments
    for (const c of commitmentsQuery.data ?? []) {
      items.push({
        id: `comm-${c.id}`,
        category: "CONSIGNMENT",
        title: `Consignment ${c.consignment_reference} · ${humanize(c.status)}`,
        detail: `Category: ${humanize(c.cargo_category)} | Priority: ${humanize(c.priority_tier)} | ${c.consigned_weight_kg} kg`,
        timestamp: c.created_at,
        badgeText: c.status,
        badgeTone: c.status === "DELIVERED" ? "ok" : c.status === "DISPATCHED" ? "warn" : "neutral",
      });
    }

    // Sort newest first
    return items.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }, [tripsQuery.data, commitmentsQuery.data, coordinationQuery.data]);

  const filteredItems = useMemo(() => {
    if (filter === "ALL") return activityFeed;
    if (filter === "TRIPS") return activityFeed.filter((x) => x.category === "TRIP");
    if (filter === "COORDINATION") return activityFeed.filter((x) => x.category === "COORDINATION");
    if (filter === "CONSIGNMENTS") return activityFeed.filter((x) => x.category === "CONSIGNMENT");
    return activityFeed;
  }, [activityFeed, filter]);

  return (
    <div className="stack" style={{ gap: "1.2rem" }}>
      <PageHeader
        title="Fleet Activity & Audit Log"
        subtitle="Chronological feed of trip dispatches, status transitions, driver directives, and delivery consignments."
        actions={
          <div style={{ display: "flex", gap: "0.3rem", background: "rgba(0, 0, 0, 0.05)", padding: "3px", borderRadius: "8px" }}>
            <Button
              size="small"
              variant={filter === "ALL" ? "primary" : "default"}
              onClick={() => setFilter("ALL")}
            >
              All ({activityFeed.length})
            </Button>
            <Button
              size="small"
              variant={filter === "TRIPS" ? "primary" : "default"}
              onClick={() => setFilter("TRIPS")}
            >
              Trips
            </Button>
            <Button
              size="small"
              variant={filter === "COORDINATION" ? "primary" : "default"}
              onClick={() => setFilter("COORDINATION")}
            >
              Directives
            </Button>
            <Button
              size="small"
              variant={filter === "CONSIGNMENTS" ? "primary" : "default"}
              onClick={() => setFilter("CONSIGNMENTS")}
            >
              Consignments
            </Button>
          </div>
        }
      />

      <Card title={`Operational Activity Log (${filteredItems.length} Events)`}>
        {tripsQuery.isPending && commitmentsQuery.isPending ? (
          <p className="muted">Loading activity audit log…</p>
        ) : filteredItems.length === 0 ? (
          <div style={{ padding: "2rem 0", textAlign: "center" }} className="muted">
            <Activity size={32} color="#94a3b8" style={{ margin: "0 auto 0.5rem auto" }} />
            <p>No activity events found for the selected category.</p>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "0.8rem" }}>
            {filteredItems.map((item) => (
              <div
                key={item.id}
                style={{
                  padding: "0.9rem 1rem",
                  border: "1px solid var(--border-color, #e2e8f0)",
                  borderRadius: "8px",
                  background: "var(--card-bg, #ffffff)",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "flex-start",
                  gap: "1rem",
                }}
              >
                <div style={{ display: "flex", gap: "0.8rem", alignItems: "flex-start" }}>
                  <div
                    style={{
                      width: "36px",
                      height: "36px",
                      borderRadius: "8px",
                      background:
                        item.category === "TRIP"
                          ? "rgba(59, 130, 246, 0.1)"
                          : item.category === "COORDINATION"
                          ? "rgba(245, 158, 11, 0.1)"
                          : "rgba(16, 185, 129, 0.1)",
                      color:
                        item.category === "TRIP"
                          ? "#2563eb"
                          : item.category === "COORDINATION"
                          ? "#d97706"
                          : "#059669",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                    }}
                  >
                    {item.category === "TRIP" && <Truck size={18} />}
                    {item.category === "COORDINATION" && <MessageSquare size={18} />}
                    {item.category === "CONSIGNMENT" && <Package size={18} />}
                  </div>

                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
                      <strong style={{ fontSize: "0.95rem" }}>{item.title}</strong>
                      {item.badgeText && (
                        <span className={`badge ${item.badgeTone ?? "neutral"}`}>
                          {item.badgeText}
                        </span>
                      )}
                    </div>
                    <p style={{ margin: "0.2rem 0 0 0", fontSize: "0.85rem", color: "var(--text-secondary, #475569)" }}>
                      {item.detail}
                    </p>
                    {item.actor && (
                      <span className="small muted" style={{ display: "block", marginTop: "2px" }}>
                        Operator / Actor: {item.actor}
                      </span>
                    )}
                  </div>
                </div>

                <div style={{ textAlign: "right", flexShrink: 0 }}>
                  <div className="small muted" style={{ display: "flex", alignItems: "center", gap: "0.3rem", justifyContent: "flex-end" }}>
                    <Clock size={12} />
                    {new Date(item.timestamp).toLocaleDateString()} {new Date(item.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </div>
                  {item.linkHref && (
                    <Link href={item.linkHref} style={{ fontSize: "0.8rem", color: "#2563eb", display: "inline-flex", alignItems: "center", gap: "2px", marginTop: "4px" }}>
                      Inspect <ExternalLink size={12} />
                    </Link>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
