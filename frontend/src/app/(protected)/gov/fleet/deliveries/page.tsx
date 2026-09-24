import type { Metadata } from "next";
import { CommitmentList } from "@/features/fleet";

export const metadata: Metadata = { title: "Deliveries" };

export default function GovDeliveriesPage() {
  return <CommitmentList />;
}
