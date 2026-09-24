"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, unwrap } from "@/shared/api";
import type { DispatchAction, PolicyVersion, RouteEvaluationRequest } from "@/shared/api";
import { useSession } from "@/shared/auth";

export type EvaluateInput = RouteEvaluationRequest;
export type EvaluateBase = Omit<RouteEvaluationRequest, "policy_version">;

/** Route evaluation is a computation that creates an immutable snapshot; it never changes road status. */
export function useEvaluateRoute() {
  return useMutation({
    mutationFn: (input: EvaluateInput) => unwrap(() => api.POST("/api/v1/routes/evaluate", { body: input })),
  });
}

export function useRoutePlan(planId: string | null) {
  const { scope } = useSession();
  return useQuery({
    queryKey: [...scope, "route-plan", planId],
    enabled: planId !== null,
    queryFn: () => unwrap(() => api.GET("/api/v1/routes/{route_plan_id}", { params: { path: { route_plan_id: planId as string } } })),
  });
}

export interface DecisionInput {
  tripId: string;
  routePlanId: string;
  action: DispatchAction;
  selectedAlternativeRank: number;
  reason: string;
}

/** Nothing is shown as accepted until the server returns the decision receipt. */
export function useDispatchDecision() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (i: DecisionInput) =>
      unwrap(() =>
        api.POST("/api/v1/trips/{trip_id}/dispatch-decisions", {
          params: { path: { trip_id: i.tripId } },
          body: { route_plan_id: i.routePlanId, action: i.action, selected_alternative_rank: i.selectedAlternativeRank, reason: i.reason },
        }),
      ),
    onSuccess: () => void qc.invalidateQueries({ predicate: (q) => q.queryKey.includes("trips") || q.queryKey.includes("trip") }),
  });
}

export const POLICY_LABEL: Record<PolicyVersion, string> = {
  CONSERVATIVE_CRITICAL_V1: "Conservative (critical cargo)",
  STANDARD_DISPATCH_V1: "Standard dispatch",
};
