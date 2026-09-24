import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ReportStatusDetail } from "@/features/field";
import { PageHeader } from "@/shared/ui";
import { isUuid } from "../../../../ids";

export const metadata: Metadata = { title: "Report status" };

export default async function ReportStatusPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  return (
    <>
      <PageHeader title="Report status" />
      <ReportStatusDetail reportId={id} />
    </>
  );
}
