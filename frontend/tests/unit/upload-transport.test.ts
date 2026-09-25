import { afterEach, describe, expect, it, vi } from "vitest";
import { httpTransport, TransportError, type UploadTicket } from "@/features/field/sync/transport";

const blob = new Blob(["jpeg-bytes"], { type: "image/jpeg" });

function ticket(over: Partial<UploadTicket>): UploadTicket {
  return { mediaId: "m1", uploadUrl: "https://storage.invalid/up", method: "PUT", headers: {}, fields: {}, ...over };
}

afterEach(() => vi.unstubAllGlobals());

describe("httpTransport.putObject", () => {
  it("PUTs the raw file with the ticket's headers for a presigned URL", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await httpTransport.putObject(ticket({ headers: { "Content-Type": "image/jpeg" } }), blob, "image/jpeg");
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://storage.invalid/up");
    expect(init.method).toBe("PUT");
    expect(init.body).toBe(blob);
    expect(init.headers).toEqual({ "Content-Type": "image/jpeg" });
  });

  it("POSTs signed fields plus the file as multipart for a Cloudinary ticket", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await httpTransport.putObject(ticket({ method: "POST", fields: { api_key: "k", signature: "sig", type: "authenticated" } }), blob, "image/jpeg");
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.method).toBe("POST");
    const form = init.body as FormData;
    expect(form.get("signature")).toBe("sig");
    expect(form.get("type")).toBe("authenticated");
    expect(form.get("file")).toBeInstanceOf(Blob);
    // The browser must set the multipart boundary itself.
    expect(init.headers).toBeUndefined();
  });

  it("turns a rejected upload into a TransportError with the status", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("nope", { status: 401 })));
    await expect(httpTransport.putObject(ticket({ method: "POST" }), blob, "image/jpeg")).rejects.toMatchObject({ status: 401 });
    await expect(httpTransport.putObject(ticket({ method: "POST" }), blob, "image/jpeg")).rejects.toBeInstanceOf(TransportError);
  });
});
