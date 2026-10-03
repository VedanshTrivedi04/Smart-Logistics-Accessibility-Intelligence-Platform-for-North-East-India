import type { Metadata } from "next";
import { NearbyView } from "@/features/field";
import { PageHeader } from "@/shared/ui";

export const metadata: Metadata = { title: "Nearby Hazards & Inspections | Inspector Intelligence" };

export default function InspectorNearbyPage() {
  return (
    <>
      <PageHeader
        title="Nearby Hazards &amp; Highway Alerts"
        subtitle="Geospatial alerts, nearby reported incidents, and road closures within your mountain patrol radius."
      />
      <NearbyView />
    </>
  );
}
