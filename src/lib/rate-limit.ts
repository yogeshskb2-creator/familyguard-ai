/**
 * Fixed-window rate limiter.
 *
 * In-memory: limits are per server instance. That's adequate for a single
 * Node server and as a first line of defence on serverless, but for strict
 * global limits back this interface with Redis/Upstash (see README).
 * Firebase Auth additionally applies its own abuse protection.
 */
export interface RateLimitResult {
  ok: boolean;
  remaining: number;
  retryAfterSec: number;
}

export function createRateLimiter({ limit, windowMs }: { limit: number; windowMs: number }) {
  const hits = new Map<string, { count: number; resetAt: number }>();

  return function check(key: string, now = Date.now()): RateLimitResult {
    if (hits.size > 10_000) {
      for (const [k, v] of hits) if (v.resetAt <= now) hits.delete(k);
    }
    let entry = hits.get(key);
    if (!entry || entry.resetAt <= now) {
      entry = { count: 0, resetAt: now + windowMs };
      hits.set(key, entry);
    }
    entry.count += 1;
    const ok = entry.count <= limit;
    return {
      ok,
      remaining: Math.max(0, limit - entry.count),
      retryAfterSec: ok ? 0 : Math.ceil((entry.resetAt - now) / 1000),
    };
  };
}

export function clientIp(headers: Headers): string {
  const fwd = headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0]!.trim();
  return headers.get("x-real-ip") ?? "unknown";
}
