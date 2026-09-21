import type { Metadata } from "next";
import { ReportQueue } from "@/features/incidents";
import { PageHeader } from "@/shared/ui";
import { Guard } from "../../../Guard";

export const metadata: Metadata = { title: "Field reports" };

export default function GovReportsPage() {
  return (
    <Guard requires={["VIEW_REPORT_SUMMARY"]}>
      <PageHeader title="Field reports" subtitle="Observations from the field. A report is not verified until a reviewer decides." />
      <ReportQueue basePath="/gov/reports" />
    </Guard>
  );
}
