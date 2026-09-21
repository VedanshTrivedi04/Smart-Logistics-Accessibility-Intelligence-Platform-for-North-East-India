import type { Metadata } from "next";
import { RoadUpdate } from "@/features/field";
import { PageHeader } from "@/shared/ui";

export const metadata: Metadata = { title: "Road update" };

export default function RoadUpdatePage() {
  return (
    <>
      <PageHeader title="Road and bridge status" />
      <RoadUpdate />
    </>
  );
}
