import type { Metadata } from "next";
import { InspectorReportsView } from "@/features/inspection";

export const metadata: Metadata = {
  title: "Patrol Reports | Road Infrastructure Intelligence",
};

export default function InspectorReportsPage() {
  return <InspectorReportsView />;
}
