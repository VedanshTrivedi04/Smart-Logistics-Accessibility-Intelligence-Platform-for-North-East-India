"use client";

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, unwrap } from "@/shared/api";
import type { AccessibilityStatus, Facility, FacilityKind } from "@/shared/api";
import { useSession } from "@/shared/auth";
import { snapBBox, type BBox } from "@/shared/lib/geo";
import { parseEdgeCollection, type EdgeCollection } from "./edges";

export const EDGE_LIMIT = 5000;

export function useEdges(bbox: BBox | null, zoom: number | null, enabled = true) {
  const { scope } = useSession();
  const snapped = bbox ? snapBBox(bbox) : null;
  const z = zoom === null ? null : Math.round(zoom);
  return useQuery<EdgeCollection>({
    queryKey: [...scope, "edges", snapped, z],
    enabled: enabled && snapped !== null,
    placeholderData: keepPreviousData,
    staleTime: 20_000,
    queryFn: async () => {
      const [min_lon, min_lat, max_lon, max_lat] = snapped as BBox;
      const raw = await unwrap(() =>
        api.GET("/api/v1/network/edges", { params: { query: { min_lon, min_lat, max_lon, max_lat, ...(z !== null ? { zoom: Math.min(22, Math.max(1, z)) } : {}), limit: EDGE_LIMIT } } }),
      );
      return parseEdgeCollection(raw);
    },
  });
}

export function useEdge(edgeId: string | null) {
  const { scope } = useSession();
  return useQuery({
    queryKey: [...scope, "edge", edgeId],
    enabled: edgeId !== null,
    queryFn: () => unwrap(() => api.GET("/api/v1/network/edges/{edge_id}", { params: { path: { edge_id: edgeId as string } } })),
  });
}

export function useFacilities(filters: { kind?: FacilityKind; is_critical?: boolean; jurisdiction_id?: string } = {}, enabled = true) {
  const { scope } = useSession();
  return useQuery<Facility[]>({
    queryKey: [...scope, "facilities", filters],
    enabled,
    queryFn: () => unwrap(() => api.GET("/api/v1/facilities", { params: { query: { ...filters, limit: 500 } } })),
  });
}

export function useReachability(facilityId: string | null, requiredWeightTonnes?: number) {
  const { scope } = useSession();
  return useQuery({
    queryKey: [...scope, "reachability", facilityId, requiredWeightTonnes ?? null],
    enabled: facilityId !== null,
    queryFn: () =>
      unwrap(() =>
        api.GET("/api/v1/facilities/{facility_id}/reachability", {
          params: { path: { facility_id: facilityId as string }, query: requiredWeightTonnes ? { required_weight_tonnes: requiredWeightTonnes } : {} },
        }),
      ),
  });
}

export function useFacilityImpacts(facilityId: string | null) {
  const { scope } = useSession();
  return useQuery({
    queryKey: [...scope, "facility-impacts", facilityId],
    enabled: facilityId !== null,
    queryFn: () => unwrap(() => api.GET("/api/v1/facilities/{facility_id}/impacts", { params: { path: { facility_id: facilityId as string } } })),
  });
}

export function useNetworkVersions() {
  const { scope } = useSession();
  return useQuery({
    queryKey: [...scope, "network-versions"],
    queryFn: () => unwrap(() => api.GET("/api/v1/network/versions")) as Promise<unknown>,
  });
}

interface DeclareInput {
  edgeId: string;
  status: AccessibilityStatus;
  reason: string;
  validUntil: string | null;
}

/**
 * Declares an official road status. The UI only reflects the new status after the
 * server confirms it: the response invalidates edge queries and nothing is set optimistically.
 */
export function useDeclareEdgeStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: DeclareInput) =>
      unwrap(() =>
        api.POST("/api/v1/network/edges/{edge_id}/status", {
          params: { path: { edge_id: input.edgeId } },
          body: { status: input.status, reason: input.reason, ...(input.validUntil ? { valid_until: input.validUntil } : {}) },
        }),
      ),
    onSuccess: () => {
      void qc.invalidateQueries({ predicate: (q) => q.queryKey.includes("edges") || q.queryKey.includes("edge") });
    },
  });
}
