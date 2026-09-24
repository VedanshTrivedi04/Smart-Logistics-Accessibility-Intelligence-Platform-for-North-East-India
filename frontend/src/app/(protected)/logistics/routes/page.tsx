import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHeader } from "@/shared/ui";
import { Guard } from "../../../Guard";
import { RouteTool } from "../../../RouteTool";

export const metadata: Metadata = { title: "Route alternatives" };

export default function LogisticsRoutesPage() {
  return (
    <Guard requires={["COMPUTE_ROUTE"]}>
      <PageHeader title="Route alternatives" subtitle="Compare options by time and distance. Recording a decision is done from a trip." />
      <Suspense fallback={<p role="status" className="muted">Loading…</p>}>
        <RouteTool />
      </Suspense>
    </Guard>
  );
}
