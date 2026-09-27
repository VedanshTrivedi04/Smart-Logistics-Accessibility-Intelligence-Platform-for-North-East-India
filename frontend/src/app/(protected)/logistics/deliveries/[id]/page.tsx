import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DeliveryDetail } from "@/features/fleet";
import { Guard } from "../../../../Guard";
import { isUuid } from "../../../../ids";

export const metadata: Metadata = { title: "Delivery Consignment Dossier" };

export default async function DeliveryDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  return (
    <Guard requires={["VIEW_FLEET"]}>
      <DeliveryDetail deliveryId={id} />
    </Guard>
  );
}
