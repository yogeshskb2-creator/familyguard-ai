import { deleteAllLocationData } from "@/lib/account/delete.server";
import { authed } from "@/lib/api/handler";
import { clientIp } from "@/lib/rate-limit";

export const runtime = "nodejs";

/** Stop sharing (live location deleted) and delete all location history. */
export const POST = authed(async ({ user, req }) => deleteAllLocationData(user.uid, clientIp(req.headers)));
