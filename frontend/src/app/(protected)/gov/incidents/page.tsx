import type { Metadata } from "next";
import { IncidentCommandCenter } from "@/features/incidents";

export const metadata: Metadata = { title: "Incident Management & Triage Center" };

export default function GovIncidentsPage() {
  return <IncidentCommandCenter />;
}
