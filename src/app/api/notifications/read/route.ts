import { z } from "zod";
import { authed } from "@/lib/api/handler";
import { FamilyError } from "@/lib/families/errors";
import { docIdSchema } from "@/lib/families/validation";
import { markRead } from "@/lib/notifications/service.server";

export const runtime = "nodejs";

const schema = z.object({ ids: z.union([z.literal("all"), z.array(docIdSchema).min(1).max(100)]) }).strict();

export const POST = authed(async ({ user, body }) => {
  const { ids } = await body(schema);
  try {
    return { marked: await markRead(user.uid, ids) };
  } catch {
    // Unknown ids (e.g. someone else's notification) fail the whole batch.
    throw new FamilyError(404, "not_found", "Notification not found.");
  }
});
