import { authed } from "@/lib/api/handler";
import { notFound } from "@/lib/families/errors";
import { docIdSchema } from "@/lib/families/validation";
import { getFamilyLocations } from "@/lib/location/service.server";

export const runtime = "nodejs";
type P = { familyId: string };

/** Locations that members chose to share with THIS family. Members only. */
export const GET = authed<P>(async ({ user, params }) => {
  const id = docIdSchema.safeParse(params.familyId);
  if (!id.success) throw notFound();
  return { members: await getFamilyLocations(id.data, user.uid), now: Date.now() };
});
