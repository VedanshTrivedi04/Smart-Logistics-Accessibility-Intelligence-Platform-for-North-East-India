import type { Metadata } from "next";
import { DisruptionsBoard } from "@/features/fleet";
import { Guard } from "../../../Guard";

export const metadata: Metadata = { title: "Disruption Intelligence | Fleet Operations" };

export default function DisruptionsPage() {
  return (
    <Guard requires={["VIEW_IMPACT"]}>
      <DisruptionsBoard />
    </Guard>
  );
}
