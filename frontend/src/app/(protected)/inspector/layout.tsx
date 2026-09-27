import type { ReactNode } from "react";
import { FieldOfflineProvider } from "@/features/field";
import { Guard } from "../../Guard";

export default function InspectorLayout({ children }: { children: ReactNode }) {
  return (
    <Guard surface="inspector">
      <FieldOfflineProvider>{children}</FieldOfflineProvider>
    </Guard>
  );
}
