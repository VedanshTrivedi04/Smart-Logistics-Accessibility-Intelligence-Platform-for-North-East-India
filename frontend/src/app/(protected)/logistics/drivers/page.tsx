import type { Metadata } from "next";
import { DriversView } from "@/features/fleet";
import { Guard } from "../../../Guard";

export const metadata: Metadata = { title: "Drivers Roster | Fleet Operations" };

export default function DriversPage() {
  return (
    <Guard requires={["VIEW_FLEET"]}>
      <DriversView />
    </Guard>
  );
}
