import type { Metadata } from "next";
import { ForbiddenView } from "@/features/session";

export const metadata: Metadata = { title: "Not permitted" };

export default function ForbiddenPage() {
  return <ForbiddenView />;
}
