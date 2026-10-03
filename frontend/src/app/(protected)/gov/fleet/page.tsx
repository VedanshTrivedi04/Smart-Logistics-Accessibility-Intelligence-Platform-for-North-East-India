import type { Metadata } from "next";
import { FleetOperationsCenter } from "@/features/fleet";

export const metadata: Metadata = { title: "Vehicles & Deliveries | Fleet Operations" };

export default function GovFleetPage() {
  return <FleetOperationsCenter />;
}
