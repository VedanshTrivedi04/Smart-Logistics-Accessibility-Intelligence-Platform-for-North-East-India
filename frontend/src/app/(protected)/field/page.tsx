import type { Metadata } from "next";
import { FieldHome } from "@/features/field";

export const metadata: Metadata = { title: "Field Operations · Ground Patrol" };

export default function FieldHomePage() {
  return <FieldHome />;
}
