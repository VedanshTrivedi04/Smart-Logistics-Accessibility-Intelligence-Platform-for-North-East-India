import type { Metadata } from "next";
import { VehiclesView } from "@/features/fleet";
import { Guard } from "../../../Guard";

export const metadata: Metadata = { title: "Vehicles | Fleet Operations" };

export default function VehiclesPage() {
  return (
    <Guard requires={["VIEW_FLEET"]}>
      <VehiclesView />
    </Guard>
  );
}
