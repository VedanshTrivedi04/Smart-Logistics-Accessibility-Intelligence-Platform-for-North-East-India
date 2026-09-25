import type { Metadata } from "next";
import { DeliveriesView } from "@/features/fleet";
import { Guard } from "../../../Guard";

export const metadata: Metadata = { title: "Deliveries & Dispatch" };

export default function DeliveriesPage() {
  return (
    <Guard requires={["VIEW_FLEET"]}>
      <DeliveriesView />
    </Guard>
  );
}
