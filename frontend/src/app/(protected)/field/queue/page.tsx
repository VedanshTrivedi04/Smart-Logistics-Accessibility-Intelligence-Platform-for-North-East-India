import type { Metadata } from "next";
import { SyncQueue } from "@/features/field";
import { PageHeader } from "@/shared/ui";

export const metadata: Metadata = { title: "Send queue" };

export default function QueuePage() {
  return (
    <>
      <PageHeader title="Send queue" subtitle="Everything saved on this device and what happens to it next." />
      <SyncQueue />
    </>
  );
}
