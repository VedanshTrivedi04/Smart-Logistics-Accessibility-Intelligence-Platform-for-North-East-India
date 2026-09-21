import type { Metadata } from "next";
import { GovOverview } from "@/features/overview";

export const metadata: Metadata = { title: "Command overview" };

export default function GovHome() {
  return <GovOverview />;
}
