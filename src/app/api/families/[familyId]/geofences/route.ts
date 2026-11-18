import { authed } from "@/lib/api/handler";
import { notFound } from "@/lib/families/errors";
import { docIdSchema } from "@/lib/families/validation";
import { createZone, listZones } from "@/lib/geofences/service.server";
import { createZoneSchema } from "@/lib/geofences/validation";

export const runtime = "nodejs";
type P = { familyId: string };
const id = (p: P) => {
  const r = docIdSchema.safeParse(p.familyId);
  if (!r.success) throw notFound();
  return r.data;
};

export const GET = authed<P>(async ({ user, params }) => ({ zones: await listZones(id(params), user.uid) }));
export const POST = authed<P>(async ({ user, params, body }) => ({ zone: await createZone(user, id(params), await body(createZoneSchema)) }));
