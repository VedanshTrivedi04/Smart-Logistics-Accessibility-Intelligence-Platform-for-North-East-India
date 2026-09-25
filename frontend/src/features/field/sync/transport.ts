import { api, isApiError, unwrap } from "@/shared/api";
import type { BatchSyncResponse } from "@/shared/api";

/** Failure at the network boundary. status 0 means the request never got an answer. */
export class TransportError extends Error {
  readonly status: number;
  readonly code: string | undefined;
  constructor(status: number, message: string, code?: string) {
    super(message);
    this.name = "TransportError";
    this.status = status;
    this.code = code;
  }
}

export interface UploadTicket {
  mediaId: string;
  uploadUrl: string;
  /** "PUT" for a presigned S3/MinIO URL, "POST" for a signed multipart upload (Cloudinary). */
  method: string;
  headers: Record<string, string>;
  /** Signed form fields sent with a POST upload. Empty for PUT. */
  fields: Record<string, string>;
}

/**
 * The only seam tests replace. Everything above it (queue, state machine, retry policy)
 * runs for real; payloads are matched to the OpenAPI schema by the generated client.
 */
export interface SyncTransport {
  requestUploadTicket(input: { fileName: string; sizeBytes: number; mimeType: string; sha256: string }): Promise<UploadTicket>;
  putObject(ticket: UploadTicket, blob: Blob, mimeType: string): Promise<void>;
  confirmUpload(mediaId: string, meta: { widthPx?: number; heightPx?: number }): Promise<void>;
  syncBatch(items: Array<Record<string, unknown>>, ctx: { appInstanceId?: string }): Promise<BatchSyncResponse>;
}

let simulatedOffline = false;
export function setSimulatedOffline(val: boolean) {
  simulatedOffline = val;
}
export function isSimulatedOffline() {
  return simulatedOffline;
}

function wrap(error: unknown): TransportError {
  if (isApiError(error)) return new TransportError(error.status, error.message, error.code);
  return new TransportError(0, error instanceof Error ? error.message : "Network error");
}

export const httpTransport: SyncTransport = {
  async requestUploadTicket({ fileName, sizeBytes, mimeType, sha256 }) {
    if (simulatedOffline) throw new TransportError(0, "Simulated NER hill network outage");
    try {
      const t = await unwrap(() => api.POST("/api/v1/media/upload-ticket", { body: { file_name: fileName, file_size_bytes: sizeBytes, mime_type: mimeType, checksum_sha256: sha256 } }));
      return { mediaId: t.media_id, uploadUrl: t.upload_url, method: t.upload_method ?? "PUT", headers: t.upload_headers ?? {}, fields: t.upload_fields ?? {} };
    } catch (e) {
      throw wrap(e);
    }
  },
  async putObject(ticket, blob, mimeType) {
    let res: Response;
    try {
      if (ticket.method === "POST") {
        // Signed multipart upload. No Content-Type header: the browser sets the multipart boundary.
        const form = new FormData();
        for (const [k, v] of Object.entries(ticket.fields)) form.append(k, v);
        form.append("file", blob);
        res = await fetch(ticket.uploadUrl, { method: "POST", body: form });
      } else {
        res = await fetch(ticket.uploadUrl, { method: "PUT", body: blob, headers: Object.keys(ticket.headers).length ? ticket.headers : { "Content-Type": mimeType } });
      }
    } catch (e) {
      throw wrap(e);
    }
    if (!res.ok) throw new TransportError(res.status, `Photo upload failed (${res.status})`);
  },
  async confirmUpload(mediaId, meta) {
    try {
      await unwrap(() => api.POST("/api/v1/media/{media_id}/confirm", { params: { path: { media_id: mediaId } }, body: { ...(meta.widthPx ? { width_px: meta.widthPx } : {}), ...(meta.heightPx ? { height_px: meta.heightPx } : {}) } }));
    } catch (e) {
      throw wrap(e);
    }
  },
  async syncBatch(items, ctx) {
    if (simulatedOffline) throw new TransportError(0, "Simulated NER hill network outage");
    try {
      return await unwrap(() => api.POST("/api/v1/reports/sync", { // The schema declares items as an untyped object array, which the generator renders as an unsatisfiable index type.
      body: { items: items as never[], ...(ctx.appInstanceId ? { app_instance_id: ctx.appInstanceId } : {}) } }));
    } catch (e) {
      throw wrap(e);
    }
  },
};
