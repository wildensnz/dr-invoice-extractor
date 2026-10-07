/**
 * Fixed-window rate limiter kept in process memory. Good enough for a demo:
 * on serverless each instance has its own window, so the real ceiling is
 * `limit × instances`. Swap for a shared store if that ever matters.
 */
export interface RateLimitOptions {
  /** Requests allowed per window. */
  limit: number;
  windowMs: number;
  /** Clock, injectable for tests. */
  now?: () => number;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  /** Milliseconds until the window resets. */
  retryAfterMs: number;
}

interface Window {
  count: number;
  resetAt: number;
}

export function createRateLimiter({
  limit,
  windowMs,
  now = Date.now,
}: RateLimitOptions) {
  const windows = new Map<string, Window>();

  function sweep(at: number) {
    for (const [key, window] of windows) {
      if (window.resetAt <= at) windows.delete(key);
    }
  }

  return {
    check(key: string): RateLimitResult {
      const at = now();
      if (windows.size > 1000) sweep(at);
      let window = windows.get(key);
      if (!window || window.resetAt <= at) {
        window = { count: 0, resetAt: at + windowMs };
        windows.set(key, window);
      }
      window.count += 1;
      const allowed = window.count <= limit;
      return {
        allowed,
        remaining: Math.max(0, limit - window.count),
        retryAfterMs: allowed ? 0 : window.resetAt - at,
      };
    },
  };
}

export type RateLimiter = ReturnType<typeof createRateLimiter>;

/** Best-effort client key for the limiter: first forwarded IP, else a constant. */
export function clientKey(headers: Headers): string {
  const forwarded = headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim();
  return headers.get('x-real-ip') ?? 'anonymous';
}
