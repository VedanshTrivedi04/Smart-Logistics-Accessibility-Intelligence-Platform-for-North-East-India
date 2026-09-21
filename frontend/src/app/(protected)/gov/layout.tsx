import type { ReactNode } from "react";
import { Guard } from "../../Guard";

export default function GovLayout({ children }: { children: ReactNode }) {
  return <Guard surface="government">{children}</Guard>;
}
