import type { Metadata } from "next";
import { LogisticsOverview } from "@/features/overview";

export const metadata: Metadata = { title: "Logistics overview" };

export default function LogisticsHomePage() {
  return <LogisticsOverview />;
}
