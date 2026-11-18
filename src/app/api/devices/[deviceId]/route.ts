import { authed } from "@/lib/api/handler";
import { deleteDevice, renameDevice } from "@/lib/devices/service.server";
import { deviceIdParam as id, renameDeviceSchema } from "@/lib/devices/validation";

export const runtime = "nodejs";
type P = { deviceId: string };

export const PATCH = authed<P>(async ({ user, params, body }) => {
  const { name } = await body(renameDeviceSchema);
  return { device: await renameDevice(user.uid, id(params), name) };
});

export const DELETE = authed<P>(async ({ user, params }) => {
  await deleteDevice(user.uid, id(params));
});
