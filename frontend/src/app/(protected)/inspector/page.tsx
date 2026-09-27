import type { Metadata } from "next";
import { InspectorHomeView } from "@/features/inspection";

export const metadata: Metadata = {
  title: "Inspector Dashboard | Road Infrastructure Intelligence",
};

export default function InspectorDashboardPage() {
  return <InspectorHomeView />;
}
