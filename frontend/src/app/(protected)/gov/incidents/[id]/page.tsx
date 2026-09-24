import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { IncidentDetail } from "@/features/incidents";
import { PageHeader } from "@/shared/ui";
import { isUuid } from "../../../../ids";

export const metadata: Metadata = { title: "Incident" };

export default async function GovIncidentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  return (
    <>
      <PageHeader title="Incident" />
      <IncidentDetail incidentId={id} reportsBase="/gov/reports" />
    </>
  );
}
