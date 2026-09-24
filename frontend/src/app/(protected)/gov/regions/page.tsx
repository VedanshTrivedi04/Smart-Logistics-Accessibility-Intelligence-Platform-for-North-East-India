import type { Metadata } from "next";
import { RegionalBreakdown } from "@/features/regions";
import { PageHeader } from "@/shared/ui";
import { Guard } from "../../../Guard";

export const metadata: Metadata = { title: "States" };

export default function GovRegionsPage() {
  return (
    <Guard requires={["VIEW_REGION", "VIEW_IMPACT"]}>
      <PageHeader title="State-wise view" subtitle="Compare states by incidents, roads, facilities and logistics, then open one to see what is behind the numbers." />
      <RegionalBreakdown />
    </Guard>
  );
}
