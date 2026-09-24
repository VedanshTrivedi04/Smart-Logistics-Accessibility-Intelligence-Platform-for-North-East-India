import type { Metadata } from "next";
import { TripList } from "@/features/fleet";

export const metadata: Metadata = { title: "Trips" };

export default function GovTripsPage() {
  return <TripList tripBase="/gov/fleet/trips" />;
}
