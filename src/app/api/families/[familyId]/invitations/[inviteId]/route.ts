import { authed } from "@/lib/api/handler";
import { notFound } from "@/lib/families/errors";
import { revokeInvitation } from "@/lib/families/service.server";
import { docIdSchema } from "@/lib/families/validation";

export const runtime = "nodejs";
type P = { familyId: string; inviteId: string };

/** Revoke a pending invitation (owner / guardian). */
export const DELETE = authed<P>(async ({ user, params }) => {
  const f = docIdSchema.safeParse(params.familyId);
  const i = docIdSchema.safeParse(params.inviteId);
  if (!f.success || !i.success) throw notFound();
  await revokeInvitation(user, f.data, i.data);
});
