import type { Metadata } from "next";
import { ImpactCommandCenter } from "@/features/impact";

export const metadata: Metadata = { title: "Disruption Impact & Route Intelligence | Gov Portal" };

export default function GovImpactPage() {
  return <ImpactCommandCenter tripBase="/gov/fleet/trips" />;
}

