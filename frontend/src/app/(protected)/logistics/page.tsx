import type { Metadata } from "next";
import { FleetHome } from "@/features/fleet";

export const metadata: Metadata = { title: "Fleet Operations Command" };

export default function LogisticsHomePage() {
  return <FleetHome />;
}
