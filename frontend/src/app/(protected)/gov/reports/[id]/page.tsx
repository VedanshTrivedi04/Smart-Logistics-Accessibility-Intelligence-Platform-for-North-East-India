import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ReportReview } from "@/features/incidents";
import { PageHeader } from "@/shared/ui";
import { Guard } from "../../../../Guard";
import { isUuid } from "../../../../ids";

export const metadata: Metadata = { title: "Review report" };

export default async function GovReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  return (
    <Guard requires={["VIEW_REPORT_DETAIL"]}>
      <PageHeader title="Review report" subtitle="Check the evidence, then verify, request more information, or reject with a reason." />
      <ReportReview reportId={id} />
    </Guard>
  );
}
