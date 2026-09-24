import type { Capability } from "@/shared/api/types";

export type Surface = "government" | "field" | "logistics";

/** Mirrors backend Role enum. The backend remains authoritative; this only picks a landing surface. */
const ROLE_SURFACE: Record<string, Surface> = {
  REGIONAL_AUTHORITY: "government",
  STATE_AUTHORITY: "government",
  DISTRICT_VERIFIER: "government",
  EMERGENCY_COORDINATOR: "government",
  PLATFORM_ADMINISTRATOR: "government",
  FIELD_OFFICER: "field",
  LOCAL_AUTHORITY: "field",
  ROAD_INSPECTION: "field",
  FLEET_MANAGER: "logistics",
  DELIVERY_COORDINATOR: "logistics",
  TRANSPORT_OPERATOR: "logistics",
};

export const ROLE_LABEL: Record<string, string> = {
  REGIONAL_AUTHORITY: "Regional authority (MDoNER)",
  STATE_AUTHORITY: "State authority",
  DISTRICT_VERIFIER: "District verifier",
  EMERGENCY_COORDINATOR: "Emergency coordinator",
  PLATFORM_ADMINISTRATOR: "Platform administrator",
  FIELD_OFFICER: "Field officer",
  LOCAL_AUTHORITY: "Local authority",
  ROAD_INSPECTION: "Road inspection team",
  FLEET_MANAGER: "Fleet manager",
  DELIVERY_COORDINATOR: "Delivery coordinator",
  TRANSPORT_OPERATOR: "Transport operator",
};

export function surfaceForRole(role: string): Surface | null {
  return ROLE_SURFACE[role] ?? null;
}

export const SURFACE_HOME: Record<Surface, string> = {
  government: "/gov",
  field: "/field",
  logistics: "/logistics",
};

export const SURFACE_LABEL: Record<Surface, string> = {
  government: "Government command",
  field: "Field operations",
  logistics: "Logistics & transport",
};

/** Route segment used for each surface in src/app. */
export const SURFACE_SEGMENT: Record<Surface, string> = {
  government: "gov",
  field: "field",
  logistics: "logistics",
};

export function hasAny(capabilities: readonly string[], required: readonly Capability[] | undefined): boolean {
  if (!required || required.length === 0) return true;
  return required.some((c) => capabilities.includes(c));
}
