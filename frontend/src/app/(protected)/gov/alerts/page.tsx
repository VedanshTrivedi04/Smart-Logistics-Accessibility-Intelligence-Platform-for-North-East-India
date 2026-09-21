import type { Metadata } from "next";
import { GovernmentAlerts } from "@/features/alerts";
import { PageHeader } from "@/shared/ui";

export const metadata: Metadata = { title: "Alerts" };

export default function GovAlertsPage() {
  return (
    <>
      <PageHeader title="Alerts" subtitle="Notices derived from current records, most urgent first." />
      <GovernmentAlerts />
    </>
  );
}
