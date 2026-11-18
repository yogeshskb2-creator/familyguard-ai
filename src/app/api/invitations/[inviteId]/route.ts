import { z } from "zod";
import { authed } from "@/lib/api/handler";
import { notFound } from "@/lib/families/errors";
import { respondToInvitation } from "@/lib/families/service.server";
import { docIdSchema } from "@/lib/families/validation";

export const runtime = "nodejs";
type P = { inviteId: string };

const respondSchema = z.object({ action: z.enum(["accept", "reject"]) }).strict();

/** The invitee accepts or rejects. */
export const POST = authed<P>(async ({ user, params, body }) => {
  const id = docIdSchema.safeParse(params.inviteId);
  if (!id.success) throw notFound();
  const { action } = await body(respondSchema);
  return respondToInvitation(user, id.data, action === "accept");
});
