import Anthropic from '@anthropic-ai/sdk';
import { NextResponse } from 'next/server';
import { extractInvoice, ExtractionError } from '@/lib/extract';
import { checkFile, MAX_FILE_BYTES } from '@/lib/files';
import { clientKey, createRateLimiter } from '@/lib/rate-limit';

export const maxDuration = 60;

/** 10 extractions per minute per client. */
const limiter = createRateLimiter({ limit: 10, windowMs: 60_000 });

function error(status: number, message: string, headers?: HeadersInit) {
  return NextResponse.json({ error: message }, { status, headers });
}

/**
 * POST multipart/form-data with a `file` field → { invoice, checks, usage }.
 * The file is checked (type sniffed, ≤ 5 MB) before any API call and is
 * never written to disk.
 */
export async function POST(request: Request): Promise<Response> {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return error(400, 'Expected multipart form data with a "file" field.');
  }
  const file = form.get('file');
  if (!(file instanceof Blob)) {
    return error(400, 'Missing "file" field.');
  }
  if (file.size > MAX_FILE_BYTES) {
    return error(413, 'The file is larger than 5 MB.');
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const check = checkFile(bytes);
  if (!check.ok) {
    return error(check.status, check.error);
  }

  const rate = limiter.check(clientKey(request.headers));
  if (!rate.allowed) {
    const seconds = Math.ceil(rate.retryAfterMs / 1000);
    return error(429, `Too many requests. Try again in ${seconds}s.`, {
      'Retry-After': String(seconds),
    });
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return error(500, 'The server has no ANTHROPIC_API_KEY configured.');
  }

  try {
    const result = await extractInvoice({
      data: bytes,
      mediaType: check.mediaType,
    });
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof ExtractionError) {
      return NextResponse.json(
        { error: err.message, issues: err.issues },
        { status: 422 },
      );
    }
    if (err instanceof Anthropic.AuthenticationError) {
      return error(502, 'The ANTHROPIC_API_KEY was rejected by the API.');
    }
    if (err instanceof Anthropic.RateLimitError) {
      return error(503, 'The model API is rate limited. Try again shortly.');
    }
    if (err instanceof Anthropic.APIError) {
      return error(502, `Model API error (${err.status ?? 'unknown'}).`);
    }
    console.error(err);
    return error(500, 'Unexpected error while extracting the invoice.');
  }
}
