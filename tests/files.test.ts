import { describe, expect, it } from 'vitest';
import {
  checkFile,
  formatBytes,
  MAX_FILE_BYTES,
  sniffMediaType,
} from '@/lib/files';

const bytes = (...values: number[]) => new Uint8Array(values);

describe('sniffMediaType', () => {
  it('detects the four allowed formats from magic numbers', () => {
    expect(sniffMediaType(bytes(0xff, 0xd8, 0xff, 0xe0, 0x00))).toBe(
      'image/jpeg',
    );
    expect(
      sniffMediaType(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0)),
    ).toBe('image/png');
    expect(
      sniffMediaType(
        new Uint8Array([
          ...Buffer.from('RIFF'),
          0,
          0,
          0,
          0,
          ...Buffer.from('WEBP'),
        ]),
      ),
    ).toBe('image/webp');
    expect(sniffMediaType(new Uint8Array(Buffer.from('%PDF-1.7\n')))).toBe(
      'application/pdf',
    );
  });

  it('returns null for anything else', () => {
    expect(sniffMediaType(new Uint8Array(Buffer.from('hello world')))).toBe(
      null,
    );
    expect(sniffMediaType(new Uint8Array(Buffer.from('GIF89a')))).toBe(null);
    expect(sniffMediaType(bytes())).toBe(null);
  });
});

describe('checkFile', () => {
  it('accepts a small PNG', () => {
    const png = bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2);
    expect(checkFile(png)).toEqual({ ok: true, mediaType: 'image/png' });
  });

  it('rejects empty, oversized and unknown files with distinct statuses', () => {
    expect(checkFile(bytes())).toMatchObject({ ok: false, status: 400 });

    const big = new Uint8Array(MAX_FILE_BYTES + 1);
    big.set([0x25, 0x50, 0x44, 0x46, 0x2d]);
    expect(checkFile(big)).toMatchObject({ ok: false, status: 413 });

    expect(
      checkFile(new Uint8Array(Buffer.from('not an image'))),
    ).toMatchObject({ ok: false, status: 415 });
  });

  it('accepts exactly 5 MB', () => {
    const exact = new Uint8Array(MAX_FILE_BYTES);
    exact.set([0x25, 0x50, 0x44, 0x46, 0x2d]);
    expect(checkFile(exact).ok).toBe(true);
  });
});

describe('formatBytes', () => {
  it('formats B, KB and MB', () => {
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(2048)).toBe('2 KB');
    expect(formatBytes(8 * 1024 * 1024)).toBe('8.0 MB');
  });
});
