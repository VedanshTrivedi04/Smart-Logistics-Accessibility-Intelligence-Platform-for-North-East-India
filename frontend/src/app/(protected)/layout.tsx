import type { ReactNode } from "react";
import { SessionGate } from "../SessionGate";

export default function ProtectedLayout({ children }: { children: ReactNode }) {
  return <SessionGate>{children}</SessionGate>;
}
