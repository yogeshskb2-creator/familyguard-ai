import { authed } from "@/lib/api/handler";
import { FamilyError, notFound } from "@/lib/families/errors";
import { createGlobalRateLimiter } from "@/lib/security/rate-limit.server";
import { inviteMember, listFamilyInvitations } from "@/lib/families/service.server";
import { docIdSchema, inviteSchema } from "@/lib/families/validation";

export const runtime = "nodejs";
type P = { familyId: string };

const id = (p: P) => {
  const r = docIdSchema.safeParse(p.familyId);
  if (!r.success) throw notFound();
  return r.data;
};

export const GET = authed<P>(async ({ user, params }) => ({ invitations: await listFamilyInvitations(id(params), user.uid) }));

/** Invitation spam guard: 30 per user per hour, across all instances. */
const inviteLimiter = createGlobalRateLimiter({ name: "invite", limit: 30, windowMs: 60 * 60_000 });

export const POST = authed<P>(async ({ user, params, body }) => {
  const input = await body(inviteSchema);
  if (!(await inviteLimiter(user.uid)).ok) throw new FamilyError(429, "rate_limited", "Too many invitations sent. Try again later.");
  return { invitation: await inviteMember(user, id(params), input) };
});
