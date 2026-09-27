"use client";

import { useQuery } from "@tanstack/react-query";
import { api, unwrap } from "@/shared/api";
import { useSession } from "@/shared/auth";

export function useEdgeImpacts(edgeId: string | null, activeOnly: boolean = true) {
  const { scope } = useSession();
  return useQuery({
    queryKey: [...scope, "edge-impacts", edgeId, activeOnly],
    enabled: edgeId !== null,
    queryFn: () =>
      unwrap(() =>
        api.GET("/api/v1/edges/{edge_id}/impacts", {
          params: { path: { edge_id: edgeId as string }, query: { active_only: activeOnly } },
        }),
      ),
  });
}
