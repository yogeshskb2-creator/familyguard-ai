import { authed } from "@/lib/api/handler";
import { getEmergencySettings, saveEmergencySettings } from "@/lib/sos/service.server";
import { emergencySettingsSchema } from "@/lib/sos/validation";

export const runtime = "nodejs";

/** Your own emergency contacts + local emergency number. Private to you. */
export const GET = authed(async ({ user }) => getEmergencySettings(user.uid));
export const PUT = authed(async ({ user, body }) => saveEmergencySettings(user.uid, await body(emergencySettingsSchema)));
