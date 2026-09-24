import type { Metadata } from "next";
import { Suspense } from "react";
import { ReportWizard } from "@/features/field";
import { PageHeader } from "@/shared/ui";
import { Guard } from "../../../../Guard";

export const metadata: Metadata = { title: "Report an incident" };

export default function NewReportPage() {
  return (
    <Guard requires={["SUBMIT_REPORT"]}>
      <PageHeader title="Report an incident" subtitle="Your draft is saved on this device as you go, so it survives a lost connection or a restart." />
      <Suspense fallback={<p role="status" className="muted">Opening your draft…</p>}>
        <ReportWizard />
      </Suspense>
    </Guard>
  );
}
