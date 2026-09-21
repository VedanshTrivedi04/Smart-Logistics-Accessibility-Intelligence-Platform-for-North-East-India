import type { ReactNode } from "react";
import { Guard } from "../../Guard";

export default function LogisticsLayout({ children }: { children: ReactNode }) {
  return <Guard surface="logistics">{children}</Guard>;
}
