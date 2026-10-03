import type { Metadata } from "next";
import { FleetActivityView } from "@/features/fleet";
import { Guard } from "../../../Guard";

export const metadata: Metadata = { title: "Activity Audit Log | Fleet Operations" };

export default function FleetActivityPage() {
  return (
    <Guard requires={["VIEW_FLEET"]}>
      <FleetActivityView />
    </Guard>
  );
}
