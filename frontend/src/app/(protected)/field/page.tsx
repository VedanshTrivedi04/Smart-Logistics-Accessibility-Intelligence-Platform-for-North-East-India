import type { Metadata } from "next";
import { FieldHome } from "@/features/field";
import { PageHeader } from "@/shared/ui";

export const metadata: Metadata = { title: "Field home" };

export default function FieldHomePage() {
  return (
    <>
      <PageHeader title="Field home" />
      <FieldHome />
    </>
  );
}
