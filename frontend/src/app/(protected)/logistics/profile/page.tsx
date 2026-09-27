import type { Metadata } from "next";
import { FleetProfileView } from "@/features/fleet";

export const metadata: Metadata = { title: "Profile | Fleet Operations" };

export default function FleetProfilePage() {
  return <FleetProfileView />;
}
