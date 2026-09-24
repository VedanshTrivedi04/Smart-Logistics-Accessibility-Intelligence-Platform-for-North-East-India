import type { Metadata } from "next";
import { LogisticsAlerts } from "@/features/alerts";
import { PageHeader } from "@/shared/ui";
import { Guard } from "../../../Guard";

export const metadata: Metadata = { title: "Alerts" };

export default function LogisticsAlertsPage() {
  return (
    <Guard requires={["VIEW_FLEET"]}>
      <PageHeader title="Alerts" subtitle="Notices for your vehicles, trips and consignments." />
      <LogisticsAlerts />
    </Guard>
  );
}
