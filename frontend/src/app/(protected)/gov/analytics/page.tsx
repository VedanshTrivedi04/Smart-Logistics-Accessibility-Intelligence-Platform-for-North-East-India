import type { Metadata } from "next";
import { AnalyticsView } from "@/features/analytics";

export const metadata: Metadata = { title: "Analytics and reports" };

export default function GovAnalyticsPage() {
  return <AnalyticsView />;
}
