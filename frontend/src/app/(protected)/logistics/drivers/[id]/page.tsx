import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DriverDetail } from "@/features/fleet";
import { Guard } from "../../../../Guard";
import { isUuid } from "../../../../ids";

export const metadata: Metadata = { title: "Driver Dossier | Fleet Operations" };

export default async function DriverDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  return (
    <Guard requires={["VIEW_FLEET"]}>
      <DriverDetail driverId={id} tripBase="/logistics/trips" />
    </Guard>
  );
}
