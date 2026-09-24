import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { TripDetail } from "@/features/fleet";
import { PageHeader } from "@/shared/ui";
import { Guard } from "../../../../Guard";
import { isUuid } from "../../../../ids";

export const metadata: Metadata = { title: "Trip" };

export default async function TripPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  return (
    <Guard requires={["VIEW_FLEET"]}>
      <PageHeader title="Trip" />
      <TripDetail tripId={id} vehicleBase="/logistics/vehicles" />
    </Guard>
  );
}
