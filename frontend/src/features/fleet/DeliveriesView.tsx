"use client";

import { useState } from "react";
import { Package, Cpu } from "lucide-react";
import { PageHeader, Button } from "@/shared/ui";
import { CommitmentList } from "./TripViews";
import { DispatchOptimizer } from "./DispatchOptimizer";

export function DeliveriesView() {
  const [tab, setTab] = useState<"consignments" | "optimizer">("consignments");

  return (
    <div className="stack" style={{ gap: "1.2rem" }}>
      <PageHeader
        title="Deliveries & Dispatch"
        subtitle={
          tab === "consignments"
            ? "Consignments ordered by priority, then deadline."
            : "Google OR-Tools solver for multi-stop vehicle routing and capacity scheduling."
        }
        actions={
          <div style={{ display: "flex", gap: "0.4rem", background: "rgba(0, 0, 0, 0.05)", padding: "3px", borderRadius: "8px" }}>
            <Button
              size="small"
              variant={tab === "consignments" ? "primary" : "default"}
              onClick={() => setTab("consignments")}
              style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}
            >
              <Package size={14} /> Consignments
            </Button>
            <Button
              size="small"
              variant={tab === "optimizer" ? "primary" : "default"}
              onClick={() => setTab("optimizer")}
              style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}
            >
              <Cpu size={14} /> AI Dispatch Optimizer
            </Button>
          </div>
        }
      />

      {tab === "consignments" ? <CommitmentList /> : <DispatchOptimizer />}
    </div>
  );
}
