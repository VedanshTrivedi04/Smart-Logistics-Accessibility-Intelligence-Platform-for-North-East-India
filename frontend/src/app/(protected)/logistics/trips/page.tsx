import type { Metadata } from "next";
import { TripList } from "@/features/fleet";
import { PageHeader } from "@/shared/ui";
import { Guard } from "../../../Guard";

export const metadata: Metadata = { title: "Trips" };

export default function TripsPage() {
  return (
    <Guard requires={["VIEW_FLEET"]}>
      <PageHeader title="Trips" />
      <TripList tripBase="/logistics/trips" />
    </Guard>
  );
}
