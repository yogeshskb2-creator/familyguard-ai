import { authed } from "@/lib/api/handler";
import { listMyDevices, registerDevice } from "@/lib/devices/service.server";
import { registerDeviceSchema } from "@/lib/devices/validation";

export const runtime = "nodejs";

/** Your own registered devices only. */
export const GET = authed(async ({ user }) => ({ devices: await listMyDevices(user.uid) }));

/** Register the device making this request. */
export const POST = authed(async ({ user, body }) => ({ device: await registerDevice(user, await body(registerDeviceSchema)) }));
