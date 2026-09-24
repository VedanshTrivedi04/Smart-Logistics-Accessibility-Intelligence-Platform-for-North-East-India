"use client";

import { AccessibilityExplorer } from "@/features/network";

/**
 * Modern MDoNER Live Regional Situational Command Center.
 * Features real-time layer toggling, domain icon markers, 3D terrain/satellite visualization,
 * and operation feeds with analytics.
 */
export function CommandMap({ routeBase = "/gov/routes" }: { routeBase?: string }) {
  return <AccessibilityExplorer routeBase={routeBase} />;
}
