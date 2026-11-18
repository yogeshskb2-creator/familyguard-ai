import { authed } from "@/lib/api/handler";
import { deleteMyHistory, listMyHistory } from "@/lib/location/service.server";

export const runtime = "nodejs";

/** Your own location history only — nobody else's history is ever exposed. */
export const GET = authed(async ({ user }) => ({ points: await listMyHistory(user.uid) }));

/** Permanently delete all your location history. */
export const DELETE = authed(async ({ user }) => ({ deleted: await deleteMyHistory(user.uid) }));
