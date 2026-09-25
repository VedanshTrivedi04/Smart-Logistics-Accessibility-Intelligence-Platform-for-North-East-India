import type { Metadata } from "next";
import { AnalyticsCommandCenter } from "@/features/analytics";

export const metadata: Metadata = { title: "Operations Analytics & Reports" };

export default function GovAnalyticsPage() {
  return <AnalyticsCommandCenter />;
}
