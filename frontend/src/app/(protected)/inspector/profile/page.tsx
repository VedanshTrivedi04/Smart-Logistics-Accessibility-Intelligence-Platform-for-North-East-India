import type { Metadata } from "next";
import { InspectorProfileView } from "@/features/inspection";

export const metadata: Metadata = {
  title: "Inspector Profile & Scope | Road Infrastructure Intelligence",
};

export default function InspectorProfilePage() {
  return <InspectorProfileView />;
}
