import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE } from "@/lib/auth/constants";
import { isSameOrigin } from "@/lib/auth/origin";
import { verifySessionCookie } from "@/lib/auth/session";
import { jsonError, noStore } from "@/lib/http";
import { createRateLimiter } from "@/lib/rate-limit";
import { getUserProfile, updateUserProfile } from "@/lib/users/profile.server";
import { fieldErrors, profileUpdateSchema } from "@/lib/validation/auth";

export const runtime = "nodejs";

const limiter = createRateLimiter({ limit: 20, windowMs: 60_000 });

export async function GET(req: NextRequest) {
  const user = await verifySessionCookie(req.cookies.get(SESSION_COOKIE)?.value);
  if (!user) return jsonError(401, "unauthenticated", "Sign in required.");
  const profile = await getUserProfile(user.uid);
  if (!profile) return jsonError(404, "not_found", "Profile not found.");
  return NextResponse.json({ profile }, { headers: noStore });
}

export async function PATCH(req: NextRequest) {
  if (!isSameOrigin(req.headers)) return jsonError(403, "bad_origin", "Cross-site request rejected.");
  const user = await verifySessionCookie(req.cookies.get(SESSION_COOKIE)?.value);
  if (!user) return jsonError(401, "unauthenticated", "Sign in required.");
  const rl = limiter(`profile:${user.uid}`);
  if (!rl.ok) return jsonError(429, "rate_limited", "Too many updates. Try again shortly.");

  const parsed = profileUpdateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: "invalid_request", message: "Invalid profile update.", fields: fieldErrors(parsed.error) } },
      { status: 400 },
    );
  }
  const profile = await updateUserProfile(user.uid, parsed.data);
  return NextResponse.json({ profile }, { headers: noStore });
}
