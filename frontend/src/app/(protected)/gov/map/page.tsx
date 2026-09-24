import type { Metadata } from "next";
import { CommandMap } from "@/features/overview";
import { PageHeader } from "@/shared/ui";
import { Guard } from "../../../Guard";

export const metadata: Metadata = { title: "Regional map" };

export default function GovMapPage() {
  return (
    <Guard requires={["VIEW_ROAD_STATUS"]}>
      <PageHeader title="Regional map" subtitle="Road status, facilities and risk zones, with vehicles, active incidents and field reports as layers. Pan and zoom to load the area in view." />
      <CommandMap routeBase="/gov/routes" />
    </Guard>
  );
}
