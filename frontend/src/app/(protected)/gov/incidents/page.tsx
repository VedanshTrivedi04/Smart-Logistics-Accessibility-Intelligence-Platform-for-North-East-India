import type { Metadata } from "next";
import { IncidentList } from "@/features/incidents";
import { PageHeader } from "@/shared/ui";

export const metadata: Metadata = { title: "Incidents" };

export default function GovIncidentsPage() {
  return (
    <>
      <PageHeader title="Incidents" subtitle="Verified operational incidents in your scope." />
      <IncidentList basePath="/gov/incidents" />
    </>
  );
}
