import type { ReactNode } from "react";
import { Guard } from "../../../Guard";
import { SubNav } from "../../../SubNav";

export default function GovFleetLayout({ children }: { children: ReactNode }) {
  return (
    <Guard requires={["VIEW_FLEET"]}>
      <SubNav
        label="Vehicles and deliveries"
        items={[
          { href: "/gov/fleet", label: "Fleet & Deliveries", exact: true },
          { href: "/gov/fleet/trips", label: "Trips" },
          { href: "/gov/fleet/deliveries", label: "Deliveries" },
        ]}
      />
      {children}
    </Guard>
  );
}
