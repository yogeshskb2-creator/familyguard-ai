import { authed } from "@/lib/api/handler";
import { FamilyError, notFound } from "@/lib/families/errors";
import { docIdSchema } from "@/lib/families/validation";
import { requestLocationShare } from "@/lib/location/service.server";
import { createGlobalRateLimiter } from "@/lib/security/rate-limit.server";

export const runtime = "nodejs";
type P = { familyId: string; uid: string };

/** At most 3 requests per person per family per 6 hours, so asking can't become spam. */
const askLimiter = createGlobalRateLimiter({ name: "ask_location", limit: 3, windowMs: 6 * 60 * 60_000 });

/** Ask a family member to share their location with this family (sends them a notification). */
export const POST = authed<P>(async ({ user, params }) => {
  const f = docIdSchema.safeParse(params.familyId);
  const u = docIdSchema.safeParse(params.uid);
  if (!f.success || !u.success) throw notFound();
  if (!(await askLimiter(`${user.uid}:${f.data}:${u.data}`)).ok) {
    throw new FamilyError(429, "rate_limited", "You've already asked recently. Give them some time.");
  }
  await requestLocationShare(user, f.data, u.data);
  return { ok: true };
});
