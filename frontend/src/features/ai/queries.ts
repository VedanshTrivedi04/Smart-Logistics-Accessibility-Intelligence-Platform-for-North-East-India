"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, unwrap } from "@/shared/api";
import { getCsrfToken } from "@/shared/api/csrf";
import { fromResponse, networkError } from "@/shared/api/errors";
import type {
  AutoTriageReportRequest,
  EstimateEtaRequest,
  EstimateEtaResponse,
  OptimizeDispatchRequest,
  OptimizeDispatchResponse,
  PredictRiskRequest,
  PredictRiskResponse,
  TextReportRequest,
  TranscribeVoiceResponse,
  TranslateTextRequest,
  TranslateTextResponse,
  VerifyPhotoResponse,
  VoiceReportResponse,
} from "@/shared/api";

// ─────────────────────────────────────────────────────────────────
// Helper for multipart/form-data POST endpoints
// ─────────────────────────────────────────────────────────────────
async function postMultipart<T>(url: string, formData: FormData): Promise<T> {
  try {
    const csrfToken = await getCsrfToken();
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "X-CSRF-Token": csrfToken,
      },
      body: formData,
      credentials: "same-origin",
    });

    if (!res.ok) {
      let errBody: unknown;
      try {
        errBody = await res.json();
      } catch {
        errBody = await res.text();
      }
      throw fromResponse(res, errBody);
    }
    return (await res.json()) as T;
  } catch (cause) {
    if (cause instanceof Error && cause.name === "ApiError") throw cause;
    throw networkError(cause);
  }
}

// ─────────────────────────────────────────────────────────────────
// Module 1: Computer Vision Hazard Verification & Auto-Triage
// ─────────────────────────────────────────────────────────────────

/** Direct photo verification using the YOLOv8m ONNX hazard verifier */
export function useVerifyPhoto() {
  return useMutation<VerifyPhotoResponse, Error, File | Blob>({
    mutationFn: async (file) => {
      const fd = new FormData();
      fd.append("file", file, file instanceof File ? file.name : "photo.jpg");
      return postMultipart<VerifyPhotoResponse>("/api/v1/ai/verify-photo", fd);
    },
  });
}

/** Auto-triage an already-submitted field report by running CV against its photo */
export function useAutoTriageReport() {
  const qc = useQueryClient();
  return useMutation<VerifyPhotoResponse, Error, AutoTriageReportRequest>({
    mutationFn: (body) =>
      unwrap(() =>
        api.POST("/api/v1/ai/auto-triage-report", {
          body,
        }),
      ),
    onSuccess: (_, vars) => {
      void qc.invalidateQueries({
        predicate: (q) => q.queryKey.includes("report") || q.queryKey.includes(vars.report_id),
      });
    },
  });
}

// ─────────────────────────────────────────────────────────────────
// Module 2: Road Disruption Risk Prediction & SHAP Explainability
// ─────────────────────────────────────────────────────────────────

export function usePredictRisk() {
  return useMutation<PredictRiskResponse, Error, PredictRiskRequest>({
    mutationFn: (body) =>
      unwrap(() =>
        api.POST("/api/v1/ai/predict-risk", {
          body,
        }),
      ),
  });
}

export function useEdgeRiskQuery(edgeId: string | null, horizon: "H3" | "H6" | "H12" | "H24" = "H24") {
  return useQuery<PredictRiskResponse, Error>({
    queryKey: ["edge-risk", edgeId, horizon],
    enabled: Boolean(edgeId),
    queryFn: () =>
      unwrap(() =>
        api.POST("/api/v1/ai/predict-risk", {
          body: {
            edge_id: edgeId as string,
            horizon,
          },
        }),
      ),
    staleTime: 60_000,
  });
}

// ─────────────────────────────────────────────────────────────────
// Module 3: Dynamic Terrain & Weather-Aware ETA (CatBoost)
// ─────────────────────────────────────────────────────────────────

export function useEstimateEta() {
  return useMutation<EstimateEtaResponse, Error, EstimateEtaRequest>({
    mutationFn: (body) =>
      unwrap(() =>
        api.POST("/api/v1/ai/estimate-eta", {
          body,
        }),
      ),
  });
}

// ─────────────────────────────────────────────────────────────────
// Module 4: Bhashini Voice & Text Translation
// ─────────────────────────────────────────────────────────────────

export interface VoiceReportInput {
  file: Blob | File;
  source_language: string;
  latitude: number;
  longitude: number;
  accuracy_m: number;
  report_type?: string | null;
  severity?: string | null;
  observed_at?: string | null;
  client_operation_id?: string | null;
}

/** Transcribe spoken audio and translate to English without creating a report */
export function useTranscribeVoice() {
  return useMutation<TranscribeVoiceResponse, Error, { file: Blob | File; source_language: string; target_language?: string }>({
    mutationFn: async ({ file, source_language, target_language = "en" }) => {
      const fd = new FormData();
      fd.append("file", file, file instanceof File ? file.name : "voice_note.wav");
      fd.append("source_language", source_language);
      fd.append("target_language", target_language);
      return postMultipart<TranscribeVoiceResponse>("/api/v1/ai/transcribe-voice", fd);
    },
  });
}

/** Submit a field report directly from spoken voice audio using Bhashini ASR + translation */
export function useVoiceReport() {
  const qc = useQueryClient();
  return useMutation<VoiceReportResponse, Error, VoiceReportInput>({
    mutationFn: async (input) => {
      const fd = new FormData();
      fd.append("file", input.file, input.file instanceof File ? input.file.name : "voice_note.wav");
      fd.append("source_language", input.source_language);
      fd.append("latitude", input.latitude.toString());
      fd.append("longitude", input.longitude.toString());
      fd.append("accuracy_m", input.accuracy_m.toString());
      if (input.report_type) fd.append("report_type", input.report_type);
      if (input.severity) fd.append("severity", input.severity);
      if (input.observed_at) fd.append("observed_at", input.observed_at);
      if (input.client_operation_id) fd.append("client_operation_id", input.client_operation_id);

      return postMultipart<VoiceReportResponse>("/api/v1/ai/voice-report", fd);
    },
    onSuccess: () => {
      void qc.invalidateQueries({
        predicate: (q) => q.queryKey.includes("reports") || q.queryKey.includes("incidents"),
      });
    },
  });
}

/** Translate typed text in regional languages (Assamese, Manipuri, Bodo, etc.) */
export function useTranslateText() {
  return useMutation<TranslateTextResponse, Error, TranslateTextRequest>({
    mutationFn: (body) =>
      unwrap(() =>
        api.POST("/api/v1/ai/translate-text", {
          body,
        }),
      ),
  });
}

/** Submit a field report from typed text in regional languages */
export function useSubmitTextReport() {
  const qc = useQueryClient();
  return useMutation<VoiceReportResponse, Error, TextReportRequest>({
    mutationFn: (body) =>
      unwrap(() =>
        api.POST("/api/v1/ai/text-report", {
          body,
        }),
      ),
    onSuccess: () => {
      void qc.invalidateQueries({
        predicate: (q) => q.queryKey.includes("reports") || q.queryKey.includes("incidents"),
      });
    },
  });
}

// ─────────────────────────────────────────────────────────────────
// Module 5: Multi-Stop Dispatch Optimization (OR-Tools)
// ─────────────────────────────────────────────────────────────────

export function useOptimizeDispatch() {
  return useMutation<OptimizeDispatchResponse, Error, OptimizeDispatchRequest>({
    mutationFn: (body) =>
      unwrap(() =>
        api.POST("/api/v1/ai/optimize-dispatch", {
          body,
        }),
      ),
  });
}
