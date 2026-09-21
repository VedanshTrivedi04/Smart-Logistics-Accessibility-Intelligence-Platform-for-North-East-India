import type { Metadata } from "next";
import { PageHeader } from "@/shared/ui";
import { Guard } from "../../../Guard";
import { RouteTool } from "../../../RouteTool";

export const metadata: Metadata = { title: "Route intelligence" };

export default function GovRoutesPage() {
  return (
    <Guard requires={["COMPUTE_ROUTE"]}>
      <PageHeader title="Route intelligence" subtitle="Explain alternatives, compare policies, and see when a snapshot stops being valid." />
      <RouteTool compare />
    </Guard>
  );
}
