import type { ReactNode } from "react";
import { FieldOfflineProvider } from "@/features/field";
import { Guard } from "../../Guard";

export default function FieldLayout({ children }: { children: ReactNode }) {
  return (
    <Guard surface="field">
      <FieldOfflineProvider>{children}</FieldOfflineProvider>
    </Guard>
  );
}
