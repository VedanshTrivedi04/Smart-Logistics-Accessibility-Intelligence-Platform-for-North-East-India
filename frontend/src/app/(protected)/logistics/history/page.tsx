import type { Metadata } from "next";
import { DeliveryHistory } from "@/features/fleet";
import { PageHeader } from "@/shared/ui";
import { Guard } from "../../../Guard";

export const metadata: Metadata = { title: "History and performance" };

export default function HistoryPage() {
  return (
    <Guard requires={["VIEW_FLEET"]}>
      <PageHeader title="Delivery history and performance" />
      <DeliveryHistory tripBase="/logistics/trips" />
    </Guard>
  );
}
