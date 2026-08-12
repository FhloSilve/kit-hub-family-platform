import type { Context } from "hono";
import { apiError, type AppBindings } from "./http";

const textDecoder = new TextDecoder("utf-8", { fatal: true });

function starts(bytes: Uint8Array, expected: number[]) {
  return expected.every((value, index) => bytes[index] === value);
}

function ascii(bytes: Uint8Array, start: number, length: number) {
  return String.fromCharCode(...bytes.slice(start, start + length));
}

function decodeBase64(value: string) {
  try {
    const raw = atob(value);
    const bytes = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
    return bytes;
  } catch {
    return null;
  }
}

export function validateUploadedFile(bytes: Uint8Array, mimeType: string) {
  if (!bytes.length) return false;
  if (mimeType === "image/png") return starts(bytes, [0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]);
  if (mimeType === "image/jpeg") return starts(bytes, [0xff,0xd8,0xff]);
  if (mimeType === "image/webp") return bytes.length >= 12 && ascii(bytes,0,4)==="RIFF" && ascii(bytes,8,4)==="WEBP";
  if (mimeType === "image/gif") return bytes.length >= 6 && ["GIF87a","GIF89a"].includes(ascii(bytes,0,6));
  if (mimeType === "application/pdf") return bytes.length >= 5 && ascii(bytes,0,5)==="%PDF-";
  if (mimeType === "text/plain") {
    if (bytes.includes(0)) return false;
    try { textDecoder.decode(bytes); return true; } catch { return false; }
  }
  return false;
}

export function safeUploadName(value: string) {
  const base = value.replace(/[\\/]/g, "_").replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, 180);
  return base || "upload";
}

export async function protectAttachmentUpload(c: Context<AppBindings>, next: () => Promise<void>) {
  if (c.req.method.toUpperCase() !== "POST") return next();
  const body = await c.req.raw.clone().json().catch(() => null) as { mimeType?: unknown; dataBase64?: unknown; fileName?: unknown } | null;
  if (!body || typeof body.mimeType !== "string" || typeof body.dataBase64 !== "string") return next();
  const bytes = decodeBase64(body.dataBase64);
  if (!bytes) return apiError(c, 422, "FILE_ENCODING_INVALID", "That file could not be decoded safely.");
  if (!validateUploadedFile(bytes, body.mimeType)) return apiError(c, 422, "FILE_SIGNATURE_MISMATCH", "The file contents do not match the selected file type.");
  if (typeof body.fileName === "string" && safeUploadName(body.fileName) !== body.fileName) {
    return apiError(c, 422, "FILE_NAME_INVALID", "Rename the file without path characters or control characters, then try again.");
  }
  await next();
}
