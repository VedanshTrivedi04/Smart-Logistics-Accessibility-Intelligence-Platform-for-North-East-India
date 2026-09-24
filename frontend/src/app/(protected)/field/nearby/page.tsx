import type { Metadata } from "next";
import { NearbyView } from "@/features/field";
import { PageHeader } from "@/shared/ui";

export const metadata: Metadata = { title: "Nearby and alerts" };

export default function NearbyPage() {
  return (
    <>
      <PageHeader title="Nearby and alerts" subtitle="Reports and road status close to you, within your assigned area." />
      <NearbyView />
    </>
  );
}
