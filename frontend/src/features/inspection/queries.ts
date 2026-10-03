"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getCsrfToken } from "@/shared/api/csrf";
import { useSession } from "@/shared/auth";
import type {
  Inspection,
  InspectionPriority,
  InspectionStats,
  InspectionStatus,
  InspectorSummary,
  SubmitAssessmentRequest,
} from "./types";

async function fetchWithAuth<T>(url: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  headers.set("Content-Type", "application/json");

  const method = init?.method?.toUpperCase() ?? "GET";
  if (["POST", "PUT", "PATCH", "DELETE"].includes(method)) {
    try {
      const csrf = await getCsrfToken();
      if (csrf) headers.set("X-CSRF-Token", csrf);
    } catch {
      /* ignore */
    }
  }

  const res = await fetch(url, {
    ...init,
    headers,
    credentials: "same-origin",
  });

  if (!res.ok) {
    const errorBody = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(errorBody.detail || `Request failed with status ${res.status}`);
  }

  return res.json() as Promise<T>;
}

export function useInspections(status?: InspectionStatus | "ALL", assignedTo?: string, edgeId?: string) {
  const { scope } = useSession();
  const queryParams = new URLSearchParams();
  if (status && status !== "ALL") queryParams.set("status", status);
  if (assignedTo) queryParams.set("assigned_to", assignedTo);
  if (edgeId) queryParams.set("edge_id", edgeId);

  const qs = queryParams.toString();
  const url = `/api/v1/inspections${qs ? `?${qs}` : ""}`;

  return useQuery({
    queryKey: [...scope, "inspections", status ?? "ALL", assignedTo ?? "self", edgeId ?? "all"],
    queryFn: () => fetchWithAuth<Inspection[]>(url),
    refetchInterval: 15_000,
  });
}

export function useAvailableInspectors() {
  const { scope } = useSession();
  return useQuery({
    queryKey: [...scope, "available-inspectors"],
    queryFn: () => fetchWithAuth<InspectorSummary[]>("/api/v1/inspections/inspectors"),
    staleTime: 60_000,
  });
}

export function useInspection(id: string | null) {
  const { scope } = useSession();
  return useQuery({
    queryKey: [...scope, "inspection", id],
    enabled: Boolean(id),
    queryFn: () => fetchWithAuth<Inspection>(`/api/v1/inspections/${id}`),
    refetchInterval: 10_000,
  });
}

export function useInspectionStats() {
  const { scope } = useSession();
  return useQuery({
    queryKey: [...scope, "inspection-stats"],
    queryFn: () => fetchWithAuth<InspectionStats>("/api/v1/inspections/stats"),
    refetchInterval: 15_000,
  });
}

export function useLatestEdgeInspection(edgeId: string | null) {
  const { scope } = useSession();
  return useQuery({
    queryKey: [...scope, "edge-inspection-latest", edgeId],
    enabled: Boolean(edgeId),
    queryFn: () => fetchWithAuth<Inspection | null>(`/api/v1/inspections/edge/${edgeId}/latest`),
  });
}

export function useStartInspection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (inspectionId: string) =>
      fetchWithAuth<Inspection>(`/api/v1/inspections/${inspectionId}/start`, {
        method: "POST",
      }),
    onSuccess: (data) => {
      void qc.invalidateQueries({ queryKey: ["inspections"] });
      void qc.invalidateQueries({ queryKey: ["inspection", data.id] });
      void qc.invalidateQueries({ queryKey: ["reports"] });
    },
  });
}

export function useSubmitAssessment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ inspectionId, payload }: { inspectionId: string; payload: SubmitAssessmentRequest }) =>
      fetchWithAuth<Inspection>(`/api/v1/inspections/${inspectionId}/assessment`, {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    onSuccess: (data) => {
      void qc.invalidateQueries({ queryKey: ["inspections"] });
      void qc.invalidateQueries({ queryKey: ["inspection", data.id] });
    },
  });
}

export function useDecideInspection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      inspectionId,
      decision,
      notes,
      rejectionReason,
      affectedEdges,
    }: {
      inspectionId: string;
      decision: string;
      notes?: string;
      rejectionReason?: string;
      affectedEdges?: [string, string, boolean][];
    }) =>
      fetchWithAuth<{ inspection_id: string; decision: string }>(`/api/v1/inspections/${inspectionId}/decide`, {
        method: "POST",
        body: JSON.stringify({
          decision,
          notes,
          rejection_reason: rejectionReason,
          affected_edges: affectedEdges,
        }),
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["inspections"] });
      void qc.invalidateQueries({ queryKey: ["reports"] });
      void qc.invalidateQueries({ queryKey: ["incidents"] });
      void qc.invalidateQueries({ queryKey: ["edges"] });
    },
  });
}

export function useAssignInspection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: {
      assigned_to: string;
      jurisdiction_id: string;
      priority: InspectionPriority;
      instructions: string;
      report_id?: string | null;
      candidate_edge_id?: string | null;
      incident_id?: string | null;
    }) =>
      fetchWithAuth<Inspection>("/api/v1/inspections", {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["inspections"] });
      void qc.invalidateQueries({ queryKey: ["inspection-stats"] });
    },
  });
}
