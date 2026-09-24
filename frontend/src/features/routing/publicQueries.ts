"use client";

import { keepPreviousData, useMutation, useQuery } from "@tanstack/react-query";
import { api, unwrap, type RoutePlan } from "@/shared/api";
import { type BBox, snapBBox } from "@/shared/lib/geo";
import { parseRiskZoneCollection } from "@/features/hazard";
import { parseEdgeCollection, type EdgeCollection } from "@/features/network";

/**
 * Anonymous, unauthenticated versions of the road-network/hazard/incident/routing
 * queries, for the public citizen surface (see backend app/modules/public). These
 * never read useSession().scope for cache keys — there is no session — and they
 * call /api/v1/public/* instead of the authenticated endpoints, which would 401
 * for a visitor who never logged in.
 */

export function usePublicEdges(bbox: BBox | null, zoom: number | null, enabled = true) {
  const snapped = bbox ? snapBBox(bbox) : null;
  const z = zoom === null ? null : Math.round(zoom);
  return useQuery<EdgeCollection>({
    queryKey: ["public", "edges", snapped, z],
    enabled: enabled && snapped !== null,
    placeholderData: keepPreviousData,
    staleTime: 20_000,
    queryFn: async () => {
      const [min_lon, min_lat, max_lon, max_lat] = snapped as BBox;
      const raw = await unwrap(() =>
        api.GET("/api/v1/public/network/edges", {
          params: { query: { min_lon, min_lat, max_lon, max_lat, ...(z !== null ? { zoom: Math.min(22, Math.max(1, z)) } : {}), limit: 2000 } },
        }),
      );
      return parseEdgeCollection(raw);
    },
  });
}

export function usePublicHazardZones(bbox: BBox | null, enabled = true) {
  const snapped = bbox ? snapBBox(bbox) : null;
  return useQuery({
    queryKey: ["public", "hazard-risk-zones", snapped],
    enabled: enabled && snapped !== null,
    placeholderData: keepPreviousData,
    staleTime: 60_000,
    queryFn: async () => {
      const [min_lon, min_lat, max_lon, max_lat] = snapped as BBox;
      const raw = await unwrap(() =>
        api.GET("/api/v1/public/hazard/risk-zones", { params: { query: { min_lon, min_lat, max_lon, max_lat, limit: 500 } } }),
      );
      return parseRiskZoneCollection(raw);
    },
  });
}

export interface PublicIncidentPoint {
  id: string;
  title: string;
  severity: string;
  lifecycle: string;
  lat: number;
  lon: number;
}

export function usePublicIncidents(enabled = true) {
  return useQuery<PublicIncidentPoint[]>({
    queryKey: ["public", "incidents"],
    enabled,
    staleTime: 30_000,
    queryFn: async () => {
      const raw = await unwrap(() => api.GET("/api/v1/public/incidents", { params: { query: { limit: 100 } } }));
      return raw.map((i) => ({ id: i.id, title: i.title, severity: i.severity, lifecycle: i.lifecycle, lat: i.approx_lat, lon: i.approx_lon }));
    },
  });
}

export interface PublicRouteInput {
  originLat: number;
  originLon: number;
  destinationLat: number;
  destinationLon: number;
}

/** Real road-following routing for a standard private vehicle — no login, no vehicle picker. */
export function useEvaluatePublicRoute() {
  return useMutation({
    mutationFn: (input: PublicRouteInput): Promise<RoutePlan> =>
      unwrap(() =>
        api.POST("/api/v1/public/routes/evaluate", {
          body: {
            origin_lat: input.originLat,
            origin_lon: input.originLon,
            destination_lat: input.destinationLat,
            destination_lon: input.destinationLon,
          },
        }),
      ),
  });
}
