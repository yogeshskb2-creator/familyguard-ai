import { authed } from "@/lib/api/handler";
import { notFound } from "@/lib/families/errors";
import { docIdSchema } from "@/lib/families/validation";
import { acknowledgeZoneAlarm } from "@/lib/geofences/service.server";

export const runtime = "nodejs";
type P = { alarmId: string };

/** "I've seen this": silences the alarm for the caller only. */
export const POST = authed<P>(async ({ user, params }) => {
  const id = docIdSchema.safeParse(params.alarmId);
  if (!id.success) throw notFound();
  await acknowledgeZoneAlarm(user, id.data);
  return { ok: true };
});
