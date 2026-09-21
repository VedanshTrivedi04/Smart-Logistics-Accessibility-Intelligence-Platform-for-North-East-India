import type { Metadata } from "next";
import { ServiceStatusView } from "@/features/session";

export const metadata: Metadata = { title: "Service status" };

export default function StatusPage() {
  return <ServiceStatusView />;
}
