import { authed } from "@/lib/api/handler";
import { heartbeat } from "@/lib/devices/service.server";
import { deviceIdParam as id } from "@/lib/devices/validation";

export const runtime = "nodejs";

export const POST = authed<{ deviceId: string }>(async ({ user, params }) => ({ device: await heartbeat(user.uid, id(params)) }));
