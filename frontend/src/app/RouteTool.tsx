"use client";

import { useSession } from "@/shared/auth";
import { QueryState } from "@/shared/ui";
import { useVehicles } from "@/features/fleet";
import { useFacilities } from "@/features/network";
import { RouteEvaluator } from "@/features/routing";

/** Composes the route evaluator with the caller's own vehicles and the facility registry. */
export function RouteTool({ compare = false }: { compare?: boolean }) {
  const { can } = useSession();
  const facilities = useFacilities();
  const vehicles = useVehicles(can("VIEW_FLEET"));
  return (
    <QueryState query={facilities} subject="facilities">
      {(list) => (
        <RouteEvaluator
          facilities={list}
          compare={compare}
          vehicles={(vehicles.data ?? []).filter((v) => v.is_active).map((v) => ({ id: v.id, label: `${v.registration_number} (${v.max_weight_kg} kg max)`, maxWeightKg: v.max_weight_kg, heightM: v.height_m, hazmatCapable: v.is_hazmat_capable }))}
        />
      )}
    </QueryState>
  );
}
