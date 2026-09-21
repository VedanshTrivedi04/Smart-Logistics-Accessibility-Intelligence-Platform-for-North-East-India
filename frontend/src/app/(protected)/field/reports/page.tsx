import type { Metadata } from "next";
import { MyReports } from "@/features/field";
import { PageHeader } from "@/shared/ui";

export const metadata: Metadata = { title: "My reports" };

export default function MyReportsPage() {
  return (
    <>
      <PageHeader title="My reports" />
      <MyReports />
    </>
  );
}
