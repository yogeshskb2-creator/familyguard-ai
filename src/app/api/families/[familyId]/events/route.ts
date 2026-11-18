import { authed } from "@/lib/api/handler";
import { listFamilyEvents } from "@/lib/families/events.server";
import { notFound } from "@/lib/families/errors";
import { docIdSchema } from "@/lib/families/validation";

export const runtime = "nodejs";

export const GET = authed<{ familyId: string }>(async ({ user, params }) => {
  const id = docIdSchema.safeParse(params.familyId);
  if (!id.success) throw notFound();
  return { events: await listFamilyEvents(id.data, user.uid) };
});
