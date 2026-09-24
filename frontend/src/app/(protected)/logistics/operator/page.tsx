import type { Metadata } from "next";
import { OperatorCockpit } from "@/features/fleet";
import { PageHeader } from "@/shared/ui";
import { Guard } from "../../../Guard";

export const metadata: Metadata = { title: "Driver & Operator Cockpit" };

export default function OperatorCockpitPage() {
  return (
    <Guard requires={["VIEW_FLEET"]}>
      <PageHeader
        title="Driver Cockpit"
        subtitle="Live on-road vehicle status, route alerts, and dispatch telemetry"
      />
      <OperatorCockpit />
    </Guard>
  );
}
