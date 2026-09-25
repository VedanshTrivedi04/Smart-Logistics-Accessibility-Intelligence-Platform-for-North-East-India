"use client";

import { useMemo } from "react";
import { useSession } from "@/shared/auth";
import { LIFELINE_CORRIDOR_BBOX } from "@/shared/lib/corridors";

export interface FieldScopeResult {
  isFieldOfficer: boolean;
  officerName: string;
  officerRole: string;
  patrolSector: string;
  /** Patrol unit label. Not in the identity payload yet, so it is null until the backend provides it. */
  unitCode: string | null;
  corridorBBox: [number, number, number, number];
  greeting: string;
  greetingIcon: string;
}

export function useFieldScope(): FieldScopeResult {
  const { principal } = useSession();

  const isFieldOfficer = useMemo(() => {
    if (!principal) return true; // Default fallback to field officer on /field surface
    const role = principal.role?.toUpperCase() ?? "";
    const name = principal.display_name?.toLowerCase() ?? "";
    const email = principal.email?.toLowerCase() ?? "";

    return (
      role === "FIELD_OFFICER" ||
      role === "ROAD_INSPECTION" ||
      role === "LOCAL_AUTHORITY" ||
      name.includes("elangbam") ||
      name.includes("meitei") ||
      email.includes("field") ||
      email.includes("patrol")
    );
  }, [principal]);

  const officerName = useMemo(() => {
    if (principal?.display_name) return principal.display_name;
    return "Elangbam Meitei";
  }, [principal]);

  const { greeting, greetingIcon } = useMemo(() => {
    const hour = new Date().getHours();
    if (hour >= 5 && hour < 12) {
      return { greeting: "Good morning", greetingIcon: "☀️" };
    }
    if (hour >= 12 && hour < 17) {
      return { greeting: "Good afternoon", greetingIcon: "🌤️" };
    }
    if (hour >= 17 && hour < 21) {
      return { greeting: "Good evening", greetingIcon: "🌅" };
    }
    return { greeting: "Night Patrol", greetingIcon: "🌙" };
  }, []);

  return {
    isFieldOfficer,
    officerName,
    officerRole: "Senior Field Officer (Ground Patrol)",
    patrolSector: "NH-27 / NH-6 Lifeline Corridor",
    unitCode: null,
    corridorBBox: LIFELINE_CORRIDOR_BBOX,
    greeting,
    greetingIcon,
  };
}
