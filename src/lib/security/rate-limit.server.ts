import "server-only";
import { Timestamp } from "firebase-admin/firestore";
import { adminDb, isAdminConfigured } from "@/lib/firebase/admin";
import { createRateLimiter, type RateLimitResult } from "@/lib/rate-limit";
import { hashId } from "./privacy";

/*
 * Rate limiting that holds across ALL server instances (serverless scales
 * horizontally, so in-memory counters alone can be bypassed by spreading
 * requests). Two layers:
 *   1. in-memory limiter — free, rejects obvious floods on this instance;
 *   2. Firestore fixed-window counter in `_rateLimits/{hash}` (transaction),
 *      the authoritative global limit. Docs expire via TTL on `expireAt`.
 * Keys are hashed, so the collection doesn't store raw IPs or user ids.
 * If Firestore is unreachable we FAIL OPEN on layer 2 (the in-memory layer
 * still applies) — a safety app must not lock people out of SOS.
 */

export function createGlobalRateLimiter({ name, limit, windowMs }: { name: string; limit: number; windowMs: number }) {
  const local = createRateLimiter({ limit, windowMs });

  return async function check(key: string, now = Date.now()): Promise<RateLimitResult> {
    const first = local(`${name}:${key}`, now);
    if (!first.ok) return first;
    if (!isAdminConfigured()) return first;

    const windowStart = Math.floor(now / windowMs) * windowMs;
    const ref = adminDb().collection("_rateLimits").doc(hashId(`${name}:${key}:${windowStart}`));
    try {
      const count = await adminDb().runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        const next = ((snap.get("count") as number | undefined) ?? 0) + 1;
        tx.set(ref, { name, count: next, windowStart, expireAt: Timestamp.fromMillis(windowStart + 2 * windowMs) });
        return next;
      });
      const ok = count <= limit;
      return { ok, remaining: Math.max(0, limit - count), retryAfterSec: ok ? 0 : Math.ceil((windowStart + windowMs - now) / 1000) };
    } catch (err) {
      console.error("[rate-limit] global check failed; using local only", name, err);
      return first;
    }
  };
}
