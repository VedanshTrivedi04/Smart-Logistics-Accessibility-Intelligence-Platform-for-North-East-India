"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import { api, unwrap } from "@/shared/api";
import type { CoordinationActionRequest, CoordinationSubjectType, Jurisdiction } from "@/shared/api";
import { useSession } from "@/shared/auth";

/** Region, states and districts. Public reference data, so it is cached for the whole session. */
export function useJurisdictions() {
  const { scope } = useSession();
  return useQuery<Jurisdiction[]>({
    queryKey: [...scope, "jurisdictions"],
    staleTime: 30 * 60_000,
    queryFn: () => unwrap(() => api.GET("/api/v1/jurisdictions")),
  });
}

export interface JurisdictionIndex {
  all: Jurisdiction[];
  states: Jurisdiction[];
  byId: Map<string, Jurisdiction>;
  /** Name for an id, or a short fallback when the jurisdiction is unknown. */
  name: (id: string | null | undefined) => string;
  /** The state a jurisdiction belongs to (itself when it is a state); null for the region or unknown ids. */
  stateOf: (id: string | null | undefined) => Jurisdiction | null;
}

export function useJurisdictionIndex(): JurisdictionIndex & { isPending: boolean; error: unknown } {
  const q = useJurisdictions();
  const index = useMemo<JurisdictionIndex>(() => {
    const all = q.data ?? [];
    const byId = new Map(all.map((j) => [j.id, j]));
    const stateOf = (id: string | null | undefined): Jurisdiction | null => {
      let cur = id ? byId.get(id) : undefined;
      for (let hops = 0; cur && hops < 5; hops++) {
        if (cur.level === "STATE") return cur;
        cur = cur.parent_id ? byId.get(cur.parent_id) : undefined;
      }
      return null;
    };
    return {
      all,
      states: all.filter((j) => j.level === "STATE"),
      byId,
      name: (id) => (id ? byId.get(id)?.name ?? "Unknown jurisdiction" : "—"),
      stateOf,
    };
  }, [q.data]);
  return { ...index, isPending: q.isPending, error: q.error };
}

/** Coordination state per subject. Only roles with COORDINATE_RESPONSE can read it. */
export function useCoordinationSummaries(subjectType?: CoordinationSubjectType, subjectRef?: string, enabled = true) {
  const { scope, can } = useSession();
  return useQuery({
    queryKey: [...scope, "coordination", subjectType ?? "all", subjectRef ?? "all"],
    enabled: enabled && can("COORDINATE_RESPONSE"),
    refetchInterval: 60_000,
    queryFn: () =>
      unwrap(() =>
        api.GET("/api/v1/coordination/summaries", {
          params: { query: { ...(subjectType ? { subject_type: subjectType } : {}), ...(subjectRef ? { subject_ref: subjectRef } : {}) } },
        }),
      ),
  });
}

export function useRecordCoordinationAction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CoordinationActionRequest) => unwrap(() => api.POST("/api/v1/coordination/actions", { body })),
    onSuccess: () => void qc.invalidateQueries({ predicate: (q) => q.queryKey.includes("coordination") }),
  });
}
