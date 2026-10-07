/**
 * Upload checks that run before anything is sent to the API. The media type
 * is sniffed from the first bytes; the type the browser declares is ignored.
 */
export const MAX_FILE_BYTES = 5 * 1024 * 1024;

export const ALLOWED_MEDIA_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
] as const;

export type MediaType = (typeof ALLOWED_MEDIA_TYPES)[number];

export type FileCheck =
  | { ok: true; mediaType: MediaType }
  | { ok: false; status: 400 | 413 | 415; error: string };

function startsWith(bytes: Uint8Array, signature: number[], offset = 0) {
  return signature.every((byte, i) => bytes[offset + i] === byte);
}

/** Detects JPEG, PNG, WebP or PDF from magic numbers. */
export function sniffMediaType(bytes: Uint8Array): MediaType | null {
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return 'image/jpeg';
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return 'image/png';
  }
  if (
    startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) && // RIFF
    startsWith(bytes, [0x57, 0x45, 0x42, 0x50], 8) // WEBP
  ) {
    return 'image/webp';
  }
  if (startsWith(bytes, [0x25, 0x50, 0x44, 0x46, 0x2d])) {
    return 'application/pdf'; // %PDF-
  }
  return null;
}

export function checkFile(bytes: Uint8Array): FileCheck {
  if (bytes.byteLength === 0) {
    return { ok: false, status: 400, error: 'The file is empty.' };
  }
  if (bytes.byteLength > MAX_FILE_BYTES) {
    return {
      ok: false,
      status: 413,
      error: `The file is ${formatBytes(bytes.byteLength)}; the limit is 5 MB.`,
    };
  }
  const mediaType = sniffMediaType(bytes);
  if (!mediaType) {
    return {
      ok: false,
      status: 415,
      error: 'Unsupported file. Upload a JPEG, PNG, WebP or PDF.',
    };
  }
  return { ok: true, mediaType };
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function toBase64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('base64');
}
