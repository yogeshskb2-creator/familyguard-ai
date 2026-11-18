import { NextResponse, type NextRequest } from "next/server";
import { adminAuth, isAdminConfigured } from "@/lib/firebase/admin";
import { RECENT_SIGN_IN_SEC, SESSION_COOKIE, SESSION_MAX_AGE_MS } from "@/lib/auth/constants";
import { isSameOrigin } from "@/lib/auth/origin";
import { needsEmailVerification, toSessionUser, verifySessionCookie } from "@/lib/auth/session";
import { jsonError, noStore } from "@/lib/http";
import { clientIp } from "@/lib/rate-limit";
import { logSecurityEvent } from "@/lib/security/events.server";
import { createGlobalRateLimiter } from "@/lib/security/rate-limit.server";
import { ensureUserProfile } from "@/lib/users/profile.server";
import { sessionRequestSchema } from "@/lib/validation/auth";

export const runtime = "nodejs";

/**
 * Session creation limits, enforced across all server instances.
 * - Per IP (flood protection): generous, because many households share one
 *   public IP behind carrier-grade NAT, office or school networks.
 * - Per account (strict): checked once the ID token is verified.
 * Password guessing never reaches this endpoint (it only accepts tokens that
 * Firebase Auth already issued; Firebase rate-limits password attempts).
 */
const ipLimiter = createGlobalRateLimiter({ name: "session-ip", limit: 60, windowMs: 60_000 });
const accountLimiter = createGlobalRateLimiter({ name: "session-uid", limit: 10, windowMs: 60_000 });

function tooMany(retryAfterSec: number) {
  return jsonError(429, "rate_limited", "Too many sign-in attempts. Try again shortly.", { "Retry-After": String(retryAfterSec) });
}

const cookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
};

/** Exchange a fresh Firebase ID token for an httpOnly session cookie. */
export async function POST(req: NextRequest) {
  const ip = clientIp(req.headers);
  if (!isSameOrigin(req.headers)) {
    void logSecurityEvent("csrf_blocked", { ip, route: "/api/auth/session" });
    return jsonError(403, "bad_origin", "Cross-site request rejected.");
  }
  const rl = await ipLimiter(ip);
  if (!rl.ok) {
    void logSecurityEvent("rate_limited", { ip, route: "/api/auth/session" });
    return tooMany(rl.retryAfterSec);
  }
  if (!isAdminConfigured()) return jsonError(503, "not_configured", "Server authentication is not configured.");

  const parsed = sessionRequestSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return jsonError(400, "invalid_request", "Missing or malformed ID token.");

  let decoded;
  try {
    decoded = await adminAuth().verifyIdToken(parsed.data.idToken, true);
  } catch {
    void logSecurityEvent("auth_invalid_token", { ip });
    return jsonError(401, "invalid_token", "Your sign-in could not be verified. Please sign in again.");
  }

  const acct = await accountLimiter(decoded.uid);
  if (!acct.ok) {
    void logSecurityEvent("rate_limited", { uid: decoded.uid, ip, route: "/api/auth/session" });
    return tooMany(acct.retryAfterSec);
  }

  if (Date.now() / 1000 - decoded.auth_time > RECENT_SIGN_IN_SEC) {
    void logSecurityEvent("auth_stale_sign_in", { uid: decoded.uid, ip });
    return jsonError(401, "stale_sign_in", "Please sign in again to continue.");
  }

  const user = toSessionUser(decoded);
  if (needsEmailVerification(user)) {
    void logSecurityEvent("auth_unverified_email", { uid: user.uid, ip });
    return jsonError(403, "email_not_verified", "Verify your email address before signing in.");
  }

  const profile = await ensureUserProfile(user);
  const sessionCookie = await adminAuth().createSessionCookie(parsed.data.idToken, {
    expiresIn: SESSION_MAX_AGE_MS,
  });

  const res = NextResponse.json(
    { user: { uid: user.uid, displayName: profile.displayName, email: user.email } },
    { headers: noStore },
  );
  res.cookies.set(SESSION_COOKIE, sessionCookie, { ...cookieOptions, maxAge: SESSION_MAX_AGE_MS / 1000 });
  return res;
}

/**
 * Sign out. `?scope=all` also revokes every refresh token for the account,
 * which invalidates all other sessions and devices on their next check.
 */
export async function DELETE(req: NextRequest) {
  if (!isSameOrigin(req.headers)) return jsonError(403, "bad_origin", "Cross-site request rejected.");
  const everywhere = req.nextUrl.searchParams.get("scope") === "all";
  if (everywhere) {
    const user = await verifySessionCookie(req.cookies.get(SESSION_COOKIE)?.value);
    if (!user) return jsonError(401, "unauthenticated", "Not signed in.");
    await adminAuth().revokeRefreshTokens(user.uid);
    void logSecurityEvent("sign_out_everywhere", { uid: user.uid, ip: clientIp(req.headers) });
  }
  const res = NextResponse.json({ ok: true }, { headers: noStore });
  res.cookies.set(SESSION_COOKIE, "", { ...cookieOptions, maxAge: 0 });
  return res;
}
