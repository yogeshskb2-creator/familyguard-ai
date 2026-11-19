import { authed } from "@/lib/api/handler";
import { notFound } from "@/lib/families/errors";
import { renewInvitationLink } from "@/lib/families/service.server";
import { docIdSchema } from "@/lib/families/validation";

export const runtime = "nodejs";
type P = { familyId: string; inviteId: string };

/** Create a fresh join link for a pending invitation (owner / guardian). The previous link stops working. */
export const POST = authed<P>(async ({ user, params }) => {
  const f = docIdSchema.safeParse(params.familyId);
  const i = docIdSchema.safeParse(params.inviteId);
  if (!f.success || !i.success) throw notFound();
  return renewInvitationLink(user, f.data, i.data);
});
