import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { VehicleDetail } from "@/features/fleet";
import { PageHeader } from "@/shared/ui";
import { Guard } from "../../../../Guard";
import { isUuid } from "../../../../ids";

export const metadata: Metadata = { title: "Vehicle" };

export default async function VehiclePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  return (
    <Guard requires={["VIEW_FLEET"]}>
      <PageHeader title="Vehicle" />
      <VehicleDetail vehicleId={id} tripBase="/logistics/trips" />
    </Guard>
  );
}
