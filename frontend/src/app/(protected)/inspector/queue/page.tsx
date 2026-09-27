import type { Metadata } from "next";
import { SyncQueue } from "@/features/field";
import { PageHeader } from "@/shared/ui";

export const metadata: Metadata = { title: "Offline Sync Queue | Inspector Intelligence" };

export default function InspectorQueuePage() {
  return (
    <>
      <PageHeader
        title="Inspector Offline Sync Queue"
        subtitle="Queued inspection operations, technical measurements, and evidence photos saved on this device."
      />
      <SyncQueue />
    </>
  );
}
