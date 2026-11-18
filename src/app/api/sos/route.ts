import { authed } from "@/lib/api/handler";
import { listSosForUser, sendSos } from "@/lib/sos/service.server";
import { sendSosSchema } from "@/lib/sos/validation";

export const runtime = "nodejs";

/** Alerts I sent + alerts sent to families I currently belong to. */
export const GET = authed(async ({ user }) => {
  const alerts = await listSosForUser(user.uid);
  return { alerts, active: alerts.filter((a) => a.status === "active") };
});

/** Send an SOS. Only ever called after the user confirms in the UI. */
export const POST = authed(async ({ user, body }) => sendSos(user, await body(sendSosSchema)));
