import type { Metadata } from "next";
import { FleetMap } from "@/features/fleet";
import { PageHeader } from "@/shared/ui";

export const metadata: Metadata = { title: "Vehicles" };

export default function GovFleetPage() {
  return (
    <>
      <PageHeader title="Vehicles" subtitle="Last reported GPS positions for vehicles visible to your organization." />
      <FleetMap vehicleBase="/gov/fleet/vehicles" />
    </>
  );
}
