import type { Metadata } from "next";
import { InspectionsListView } from "@/features/inspection";

export const metadata: Metadata = {
  title: "My Inspections | Road Infrastructure Intelligence",
};

export default function InspectionsPage() {
  return <InspectionsListView />;
}
