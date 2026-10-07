import { describe, expect, it } from 'vitest';
import { clientKey, createRateLimiter } from '@/lib/rate-limit';

describe('createRateLimiter', () => {
  it('allows `limit` requests per window and then blocks', () => {
    let t = 0;
    const limiter = createRateLimiter({
      limit: 3,
      windowMs: 1000,
      now: () => t,
    });
    expect(limiter.check('a')).toEqual({
      allowed: true,
      remaining: 2,
      retryAfterMs: 0,
    });
    limiter.check('a');
    expect(limiter.check('a').remaining).toBe(0);
    t = 400;
    expect(limiter.check('a')).toEqual({
      allowed: false,
      remaining: 0,
      retryAfterMs: 600,
    });
  });

  it('keeps separate windows per key and resets after the window', () => {
    let t = 0;
    const limiter = createRateLimiter({
      limit: 1,
      windowMs: 1000,
      now: () => t,
    });
    expect(limiter.check('a').allowed).toBe(true);
    expect(limiter.check('b').allowed).toBe(true);
    expect(limiter.check('a').allowed).toBe(false);
    t = 1000;
    expect(limiter.check('a').allowed).toBe(true);
  });
});

describe('clientKey', () => {
  it('uses the first forwarded IP, then x-real-ip, then a constant', () => {
    expect(
      clientKey(new Headers({ 'x-forwarded-for': '1.2.3.4, 10.0.0.1' })),
    ).toBe('1.2.3.4');
    expect(clientKey(new Headers({ 'x-real-ip': '5.6.7.8' }))).toBe('5.6.7.8');
    expect(clientKey(new Headers())).toBe('anonymous');
  });
});
