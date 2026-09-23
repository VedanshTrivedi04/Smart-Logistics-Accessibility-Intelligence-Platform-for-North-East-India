"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { api, unwrap } from "@/shared/api";
import { useSession } from "@/shared/auth";
import { snapBBox, type BBox } from "@/shared/lib/geo";
import { parseRiskZoneCollection } from "./riskZones";

export function useRiskZones(bbox: BBox | null, enabled = true) {
  const { scope } = useSession();
  const snapped = bbox ? snapBBox(bbox) : null;
  return useQuery({
    queryKey: [...scope, "hazard-risk-zones", snapped],
    enabled: enabled && snapped !== null,
    placeholderData: keepPreviousData,
    // Rainfall-driven risk changes slowly relative to road status; a longer stale time avoids
    // refetching the whole overlay on every small pan.
    staleTime: 60_000,
    queryFn: async () => {
      const [min_lon, min_lat, max_lon, max_lat] = snapped as BBox;
      const raw = await unwrap(() => api.GET("/api/v1/hazard/risk-zones", { params: { query: { min_lon, min_lat, max_lon, max_lat, limit: 500 } } }));
      return parseRiskZoneCollection(raw);
    },
  });
}
