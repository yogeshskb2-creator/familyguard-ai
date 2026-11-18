import { authed } from "@/lib/api/handler";
import { getMySharingState, startSharing, stopSharing, updateSharing } from "@/lib/location/service.server";
import { startSharingSchema, updateSharingSchema } from "@/lib/location/validation";

export const runtime = "nodejs";

/** My consent state and last known location. */
export const GET = authed(async ({ user }) => getMySharingState(user.uid));

/** Opt in: choose families + history settings. */
export const POST = authed(async ({ user, body }) => ({ consent: await startSharing(user, await body(startSharingSchema)) }));

/** Change families / history settings while sharing. */
export const PATCH = authed(async ({ user, body }) => ({ consent: await updateSharing(user, await body(updateSharingSchema)) }));

/** Stop sharing: consent revoked and live location deleted. */
export const DELETE = authed(async ({ user }) => {
  await stopSharing(user.uid);
});
