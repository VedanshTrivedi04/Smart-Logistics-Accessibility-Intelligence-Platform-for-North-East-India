import type { Metadata } from "next";
import { EmergencyBoard } from "@/features/overview";
import { Guard } from "../../../Guard";

export const metadata: Metadata = { title: "Emergency operations" };

export default function GovEmergencyPage() {
  return (
    <Guard requires={["RESPOND_EMERGENCY"]}>
      <EmergencyBoard />
    </Guard>
  );
}
