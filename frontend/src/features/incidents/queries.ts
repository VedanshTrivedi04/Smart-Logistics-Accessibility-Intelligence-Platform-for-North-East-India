"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, unwrap } from "@/shared/api";
import type { IncidentLifecycle, RejectionReason, ResolutionReason, ReviewState } from "@/shared/api";
import { useSession } from "@/shared/auth";

export const LIST_LIMIT = 200;

export function useIncidents(lifecycle?: IncidentLifecycle, enabled = true) {
  const { scope } = useSession();
  return useQuery({
    queryKey: [...scope, "incidents", lifecycle ?? "all"],
    enabled,
    queryFn: () => unwrap(() => api.GET("/api/v1/incidents", { params: { query: { ...(lifecycle ? { lifecycle } : {}), limit: LIST_LIMIT } } })),
  });
}

export function useIncident(id: string | null) {
  const { scope } = useSession();
  return useQuery({
    queryKey: [...scope, "incident", id],
    enabled: id !== null,
    queryFn: () => unwrap(() => api.GET("/api/v1/incidents/{incident_id}", { params: { path: { incident_id: id as string } } })),
  });
}

export function useReports(reviewState?: ReviewState, enabled = true) {
  const { scope } = useSession();
  return useQuery({
    queryKey: [...scope, "reports", reviewState ?? "all"],
    enabled,
    queryFn: () => unwrap(() => api.GET("/api/v1/reports", { params: { query: { ...(reviewState ? { review_state: reviewState } : {}), limit: LIST_LIMIT } } })),
  });
}

export function useReport(id: string | null) {
  const { scope } = useSession();
  return useQuery({
    queryKey: [...scope, "report", id],
    enabled: id !== null,
    queryFn: () => unwrap(() => api.GET("/api/v1/reports/{report_id}", { params: { path: { report_id: id as string } } })),
  });
}

/** Short-lived signed URL; fetched only on demand and never cached across sessions. */
export function useMediaUrl(mediaId: string | null) {
  const { scope } = useSession();
  return useQuery({
    queryKey: [...scope, "media-url", mediaId],
    enabled: mediaId !== null,
    staleTime: 5 * 60_000,
    gcTime: 5 * 60_000,
    retry: false,
    queryFn: () => unwrap(() => api.GET("/api/v1/media/{media_id}/download", { params: { path: { media_id: mediaId as string } } })),
  });
}

function invalidateOperational(qc: ReturnType<typeof useQueryClient>) {
  void qc.invalidateQueries({ predicate: (q) => ["reports", "report", "incidents", "incident", "edges", "edge"].some((k) => q.queryKey.includes(k)) });
}

export function useTriage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (reportId: string) => unwrap(() => api.POST("/api/v1/reports/{report_id}/triage", { params: { path: { report_id: reportId } } })),
    onSuccess: () => invalidateOperational(qc),
  });
}

export interface ReviewInput {
  reportId: string;
  version: number;
  decision: "CONFIRM_INCIDENT" | "REJECT_REPORT" | "REQUEST_MORE_INFO";
  notes?: string;
  rejectionReason?: RejectionReason;
  existingIncidentId?: string;
  incidentTitle?: string;
  affectedEdges?: Array<{ edge_id: string; is_full_closure: boolean }>;
}

/** Sends If-Match with the version the reviewer actually saw; a 412 means someone else decided first. */
export function useReview() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (i: ReviewInput) =>
      unwrap(() =>
        api.POST("/api/v1/reports/{report_id}/review", {
          params: { path: { report_id: i.reportId }, header: { "If-Match": String(i.version) } },
          body: {
            decision: i.decision,
            ...(i.notes ? { notes: i.notes } : {}),
            ...(i.rejectionReason ? { rejection_reason: i.rejectionReason } : {}),
            ...(i.existingIncidentId ? { existing_incident_id: i.existingIncidentId } : {}),
            ...(i.incidentTitle ? { incident_title: i.incidentTitle } : {}),
            affected_edges: (i.affectedEdges ?? []).map((e) => ({ ...e, affected_direction: "BOTH" })),
          },
        }),
      ),
    onSuccess: () => invalidateOperational(qc),
  });
}

export function useResolveIncident() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (i: { incidentId: string; reason: ResolutionReason; notes?: string; affectedEdgeIds?: string[] }) =>
      unwrap(() =>
        api.POST("/api/v1/incidents/{incident_id}/resolve", {
          params: { path: { incident_id: i.incidentId } },
          body: { reason: i.reason, ...(i.notes ? { notes: i.notes } : {}), affected_edge_ids: i.affectedEdgeIds ?? [] },
        }),
      ),
    onSuccess: () => invalidateOperational(qc),
  });
}

export function useMergeIncident() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (i: { incidentId: string; targetId: string; notes?: string }) =>
      unwrap(() =>
        api.POST("/api/v1/incidents/{incident_id}/merge", {
          params: { path: { incident_id: i.incidentId } },
          body: { target_incident_id: i.targetId, ...(i.notes ? { notes: i.notes } : {}) },
        }),
      ),
    onSuccess: () => invalidateOperational(qc),
  });
}
