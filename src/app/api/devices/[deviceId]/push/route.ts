import { authed } from "@/lib/api/handler";
import { disablePush, enablePush } from "@/lib/devices/service.server";
import { pushTokenSchema } from "@/lib/devices/validation";
import { deviceIdParam as id } from "@/lib/devices/validation";

export const runtime = "nodejs";
type P = { deviceId: string };

/** Turn on push for this device (after the user granted browser permission). */
export const PUT = authed<P>(async ({ user, params, body }) => {
  const { token } = await body(pushTokenSchema);
  return { device: await enablePush(user.uid, id(params), token) };
});

export const DELETE = authed<P>(async ({ user, params }) => ({ device: await disablePush(user.uid, id(params)) }));
