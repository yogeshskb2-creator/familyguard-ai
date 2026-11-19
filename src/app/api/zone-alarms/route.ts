import { authed } from "@/lib/api/handler";
import { listMyZoneAlarms } from "@/lib/geofences/service.server";

export const runtime = "nodejs";

/** Safe-zone alarms the signed-in owner/guardian hasn't acknowledged yet. */
export const GET = authed(async ({ user }) => ({ alarms: await listMyZoneAlarms(user.uid) }));
