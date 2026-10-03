import type { Metadata } from "next";
import { AssignmentsView } from "@/features/fleet";
import { Guard } from "../../../Guard";

export const metadata: Metadata = { title: "Fleet Assignments & Dispatch Desk" };

export default function AssignmentsPage() {
  return (
    <Guard requires={["DISPATCH_ROUTE"]}>
      <AssignmentsView />
    </Guard>
  );
}
