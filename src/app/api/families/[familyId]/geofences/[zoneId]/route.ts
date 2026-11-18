import { authed } from "@/lib/api/handler";
import { notFound } from "@/lib/families/errors";
import { docIdSchema } from "@/lib/families/validation";
import { deleteZone, updateZone } from "@/lib/geofences/service.server";
import { updateZoneSchema } from "@/lib/geofences/validation";

export const runtime = "nodejs";
type P = { familyId: string; zoneId: string };
const ids = (p: P) => {
  const f = docIdSchema.safeParse(p.familyId);
  const z = docIdSchema.safeParse(p.zoneId);
  if (!f.success || !z.success) throw notFound();
  return { familyId: f.data, zoneId: z.data };
};

export const PATCH = authed<P>(async ({ user, params, body }) => {
  const { familyId, zoneId } = ids(params);
  return { zone: await updateZone(user, familyId, zoneId, await body(updateZoneSchema)) };
});

export const DELETE = authed<P>(async ({ user, params }) => {
  const { familyId, zoneId } = ids(params);
  await deleteZone(user, familyId, zoneId);
});
