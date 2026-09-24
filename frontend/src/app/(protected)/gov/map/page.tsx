import type { Metadata } from "next";
import { AccessibilityExplorer } from "@/features/network";
import { PageHeader } from "@/shared/ui";
import { Guard } from "../../../Guard";

export const metadata: Metadata = { title: "Accessibility map" };

export default function GovMapPage() {
  return (
    <Guard requires={["VIEW_ROAD_STATUS"]}>
      <PageHeader title="Accessibility map" subtitle="Verified road status with coverage and freshness. Pan and zoom to load the area in view." />
      <AccessibilityExplorer routeBase="/gov/routes" />
    </Guard>
  );
}
