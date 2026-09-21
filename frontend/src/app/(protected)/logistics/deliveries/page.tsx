import type { Metadata } from "next";
import { CommitmentList } from "@/features/fleet";
import { PageHeader } from "@/shared/ui";
import { Guard } from "../../../Guard";

export const metadata: Metadata = { title: "Deliveries" };

export default function DeliveriesPage() {
  return (
    <Guard requires={["VIEW_FLEET"]}>
      <PageHeader title="Deliveries" subtitle="Consignments ordered by priority, then deadline." />
      <CommitmentList />
    </Guard>
  );
}
