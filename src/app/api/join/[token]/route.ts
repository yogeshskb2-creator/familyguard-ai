import { z } from "zod";
import { authed } from "@/lib/api/handler";
import { FamilyError } from "@/lib/families/errors";
import { respondByJoinLink } from "@/lib/families/service.server";
import { joinTokenSchema } from "@/lib/families/validation";
import { createGlobalRateLimiter } from "@/lib/security/rate-limit.server";

export const runtime = "nodejs";
type P = { token: string };

const respondSchema = z.object({ action: z.enum(["accept", "reject"]) }).strict();

/** Link guessing is infeasible (192-bit tokens); this still caps abuse per account. */
const joinLimiter = createGlobalRateLimiter({ name: "join_link", limit: 20, windowMs: 60 * 60_000 });

/** Accept or decline an invitation through its private join link. */
export const POST = authed<P>(async ({ user, params, body }) => {
  const { action } = await body(respondSchema);
  if (!(await joinLimiter(user.uid)).ok) throw new FamilyError(429, "rate_limited", "Too many attempts. Try again later.");
  const token = joinTokenSchema.safeParse(params.token);
  if (!token.success) {
    throw new FamilyError(404, "invalid_link", "This invitation link isn't valid any more. It may have been used already. Ask for a new link.");
  }
  return respondByJoinLink(user, token.data, action === "accept");
});
