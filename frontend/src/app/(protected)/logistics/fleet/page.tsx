import type { Metadata } from "next";
import { FleetMap } from "@/features/fleet";
import { PageHeader } from "@/shared/ui";
import { Guard } from "../../../Guard";

export const metadata: Metadata = { title: "Live fleet map" };

export default function FleetPage() {
  return (
    <Guard requires={["VIEW_FLEET"]}>
      <PageHeader title="Live fleet map" subtitle="Where each vehicle was last heard from, and how old that is." />
      <FleetMap vehicleBase="/logistics/vehicles" />
    </Guard>
  );
}
