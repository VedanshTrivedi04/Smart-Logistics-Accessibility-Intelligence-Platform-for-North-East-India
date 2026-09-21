import type { Metadata } from "next";
import { ImpactBoard } from "@/features/impact";
import { PageHeader } from "@/shared/ui";

export const metadata: Metadata = { title: "Impact" };

export default function GovImpactPage() {
  return (
    <>
      <PageHeader title="Impact of disruptions" subtitle="Which facilities, trips and consignments a disruption affects, from recorded assessments." />
      <ImpactBoard tripBase="/gov/fleet/trips" />
    </>
  );
}
