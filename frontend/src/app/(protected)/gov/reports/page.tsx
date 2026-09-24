import type { Metadata } from "next";
import { ReportsCommandCenter } from "@/features/incidents";
import { Guard } from "../../../Guard";

export const metadata: Metadata = { title: "Field Reports & Ground Intelligence | MDoNER" };

export default function GovReportsPage() {
  return (
    <Guard requires={["VIEW_REPORT_SUMMARY"]}>
      <ReportsCommandCenter basePath="/gov/reports" />
    </Guard>
  );
}
