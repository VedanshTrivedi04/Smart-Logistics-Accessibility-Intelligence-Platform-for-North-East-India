import type { Metadata } from "next";
import { DriverList, FleetManagement } from "@/features/fleet";
import { PageHeader } from "@/shared/ui";
import { Guard } from "../../../Guard";

export const metadata: Metadata = { title: "Fleet management" };

export default function ManagePage() {
  return (
    <Guard requires={["VIEW_FLEET"]}>
      <PageHeader title="Fleet management" subtitle="Register vehicles and drivers, record consignments and plan trips." />
      <DriverList />
      <FleetManagement />
    </Guard>
  );
}
