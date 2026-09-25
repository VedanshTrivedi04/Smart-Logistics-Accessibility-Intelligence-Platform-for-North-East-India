import type { Metadata } from "next";
import { ActionableAlertsCenter } from "@/features/alerts";

export const metadata: Metadata = { title: "Actionable Alerts | Emergency Command" };

export default function GovAlertsPage() {
  return <ActionableAlertsCenter />;
}
