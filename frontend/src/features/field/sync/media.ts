import { ALLOWED_MIME, MAX_PHOTO_BYTES } from "../model";

export async function sha256Hex(blob: Blob): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", await blob.arrayBuffer());
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export interface PreparedImage {
  blob: Blob;
  fileName: string;
  width?: number;
  height?: number;
  resized: boolean;
}

const TARGET_BYTES = 2 * 1024 * 1024;
const MAX_EDGE = 2048;

/**
 * Validate and, for large photos, downscale before storing on the device. This saves
 * scarce storage and mobile data. If resizing is unsupported the original is kept.
 */
export async function prepareImage(file: File): Promise<PreparedImage> {
  if (!(ALLOWED_MIME as readonly string[]).includes(file.type)) throw new Error("Only JPEG, PNG or WebP photos can be attached.");
  let result: PreparedImage = { blob: file, fileName: file.name || "photo.jpg", resized: false };
  if (file.size > TARGET_BYTES && typeof createImageBitmap === "function" && typeof document !== "undefined") {
    try {
      const bmp = await createImageBitmap(file);
      const scale = Math.min(1, MAX_EDGE / Math.max(bmp.width, bmp.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(bmp.width * scale);
      canvas.height = Math.round(bmp.height * scale);
      canvas.getContext("2d")?.drawImage(bmp, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.82));
      if (blob && blob.size < file.size) result = { blob, fileName: (file.name || "photo").replace(/\.\w+$/, "") + ".jpg", width: canvas.width, height: canvas.height, resized: true };
    } catch {
      /* keep the original */
    }
  }
  if (result.blob.size > MAX_PHOTO_BYTES) throw new Error("This photo is larger than 10 MB even after resizing. Choose a smaller one.");
  return result;
}
