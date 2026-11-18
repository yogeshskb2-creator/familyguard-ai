import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { ZodError, type ZodType } from "zod";
import { SESSION_COOKIE } from "@/lib/auth/constants";
import { isSameOrigin } from "@/lib/auth/origin";
import { needsEmailVerification, verifySessionCookie, type SessionUser } from "@/lib/auth/session";
import { FamilyError } from "@/lib/families/errors";
import { jsonError, noStore } from "@/lib/http";
import { clientIp, createRateLimiter } from "@/lib/rate-limit";
import { logSecurityEvent } from "@/lib/security/events.server";
import { fieldErrors } from "@/lib/validation/auth";

/** Shared per-user budget for mutating API calls. */
const mutationLimiter = createRateLimiter({ limit: 30, windowMs: 60_000 });

export interface AuthedCtx<P> {
  req: NextRequest;
  user: SessionUser;
  params: P;
  /** Parse + validate the JSON body; a validation failure becomes a 400. */
  body: <T>(schema: ZodType<T>) => Promise<T>;
}

/**
 * Wraps an authenticated API route:
 *  - same-origin check on mutating methods → 403 (CSRF)
 *  - verifies the session cookie, incl. revocation → 401
 *  - requires a verified email for password accounts → 403
 *  - per-user rate limit on mutating methods → 429
 *  - maps domain/validation errors to JSON; anything else is a generic 500
 */
export function authed<P = Record<string, string>>(fn: (ctx: AuthedCtx<P>) => Promise<unknown>) {
  return async (req: NextRequest, route: { params: Promise<P> }) => {
    const mutating = req.method !== "GET" && req.method !== "HEAD";
    const ip = clientIp(req.headers);
    const path = req.nextUrl.pathname;
    if (mutating && !isSameOrigin(req.headers)) {
      void logSecurityEvent("csrf_blocked", { ip, route: path });
      return jsonError(403, "bad_origin", "Cross-site request rejected.");
    }

    const cookie = req.cookies.get(SESSION_COOKIE)?.value;
    const user = await verifySessionCookie(cookie);
    if (!user) {
      // A cookie that fails verification is forged, expired or revoked — worth recording.
      if (cookie) void logSecurityEvent("session_rejected", { ip, route: path });
      return jsonError(401, "unauthenticated", "Sign in required.");
    }
    if (needsEmailVerification(user)) return jsonError(403, "email_not_verified", "Verify your email first.");

    if (mutating) {
      const rl = mutationLimiter(`mut:${user.uid}`);
      if (!rl.ok) {
        void logSecurityEvent("rate_limited", { uid: user.uid, ip, route: path });
        return jsonError(429, "rate_limited", "Too many requests. Slow down.", { "Retry-After": String(rl.retryAfterSec) });
      }
    }

    try {
      const params = ((await route?.params) ?? {}) as P;
      const body = async <T,>(schema: ZodType<T>) => schema.parse(await req.json().catch(() => ({})));
      const result = await fn({ req, user, params, body });
      return NextResponse.json(result ?? { ok: true }, { headers: noStore });
    } catch (err) {
      if (err instanceof FamilyError) {
        if (err.status === 429) void logSecurityEvent("rate_limited", { uid: user.uid, ip, route: path });
        return jsonError(err.status, err.code, err.message);
      }
      if (err instanceof ZodError) {
        return NextResponse.json(
          { error: { code: "invalid_request", message: err.issues[0]?.message ?? "Invalid request.", fields: fieldErrors(err) } },
          { status: 400, headers: noStore },
        );
      }
      console.error("[api]", req.method, req.nextUrl.pathname, err);
      return jsonError(500, "internal", "Something went wrong.");
    }
  };
}
