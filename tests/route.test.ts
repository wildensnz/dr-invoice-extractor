import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { POST } from '@/app/api/extract/route';
import { ExtractionError } from '@/lib/extract';

vi.mock('@/lib/extract', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/extract')>();
  return { ...actual, extractInvoice: vi.fn() };
});

const { extractInvoice } = await import('@/lib/extract');
const extractMock = vi.mocked(extractInvoice);

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1]);

function post(body: BodyInit | null, headers: HeadersInit = {}) {
  return POST(
    new Request('http://localhost/api/extract', {
      method: 'POST',
      body,
      headers,
    }),
  );
}

function upload(bytes: Uint8Array, name = 'f.png', ip = `ip-${Math.random()}`) {
  const form = new FormData();
  form.append('file', new Blob([bytes.slice().buffer]), name);
  return post(form, { 'x-forwarded-for': ip });
}

describe('POST /api/extract', () => {
  beforeEach(() => {
    vi.stubEnv('ANTHROPIC_API_KEY', 'test-key');
    extractMock.mockReset();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('rejects non-multipart bodies without calling the API', async () => {
    const res = await post('plain text', { 'content-type': 'text/plain' });
    expect(res.status).toBe(400);
    expect(extractMock).not.toHaveBeenCalled();
  });

  it('rejects a missing file field', async () => {
    const res = await post(new FormData());
    expect(res.status).toBe(400);
    expect(extractMock).not.toHaveBeenCalled();
  });

  it('rejects unsupported types by content, not by name', async () => {
    const res = await upload(new Uint8Array(Buffer.from('hello')), 'fake.png');
    expect(res.status).toBe(415);
    expect(await res.json()).toMatchObject({
      error: expect.stringMatching(/JPEG/),
    });
    expect(extractMock).not.toHaveBeenCalled();
  });

  it('rejects files over 5 MB without reading them', async () => {
    const big = new Uint8Array(5 * 1024 * 1024 + 1);
    big.set(PNG);
    const res = await upload(big);
    expect(res.status).toBe(413);
    expect(extractMock).not.toHaveBeenCalled();
  });

  it('returns the extraction result for a valid file', async () => {
    const payload = { invoice: { ncf: 'B0100000001' }, checks: [], usage: {} };
    extractMock.mockResolvedValueOnce(payload as never);
    const res = await upload(PNG);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(payload);
    expect(extractMock).toHaveBeenCalledWith({
      data: expect.any(Uint8Array),
      mediaType: 'image/png',
    });
  });

  it('fails clearly when the API key is missing', async () => {
    vi.stubEnv('ANTHROPIC_API_KEY', '');
    const res = await upload(PNG);
    expect(res.status).toBe(500);
    expect(await res.json()).toMatchObject({
      error: expect.stringMatching(/ANTHROPIC_API_KEY/),
    });
    expect(extractMock).not.toHaveBeenCalled();
  });

  it('maps ExtractionError to 422 with the issues', async () => {
    extractMock.mockRejectedValueOnce(
      new ExtractionError('nope', ['total: x']),
    );
    const res = await upload(PNG);
    expect(res.status).toBe(422);
    expect(await res.json()).toEqual({ error: 'nope', issues: ['total: x'] });
  });

  it('rate limits the 11th request from the same client within a minute', async () => {
    extractMock.mockResolvedValue({} as never);
    const ip = 'rate-limited-client';
    for (let i = 0; i < 10; i += 1) {
      expect((await upload(PNG, 'f.png', ip)).status).toBe(200);
    }
    const res = await upload(PNG, 'f.png', ip);
    expect(res.status).toBe(429);
    expect(res.headers.get('Retry-After')).toMatch(/^\d+$/);
    expect(extractMock).toHaveBeenCalledTimes(10);
  });
});
