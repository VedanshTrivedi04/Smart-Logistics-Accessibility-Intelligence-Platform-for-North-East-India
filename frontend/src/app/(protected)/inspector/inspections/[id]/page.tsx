import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { InspectionDossierView } from "@/features/inspection";
import { isUuid } from "../../../../ids";

export const metadata: Metadata = {
  title: "Inspection Dossier | Road Infrastructure Intelligence",
};

export default async function InspectionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  return <InspectionDossierView inspectionId={id} />;
}
