import { z } from "zod";
import { deleteAccount } from "@/lib/account/delete.server";
import { authed } from "@/lib/api/handler";
import { FamilyError } from "@/lib/families/errors";
import { clientIp } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Account deletion must be backed by a sign-in from the last few minutes. */
const REAUTH_WINDOW_SEC = 5 * 60;
const schema = z.object({ confirm: z.literal("DELETE", { message: 'Type "DELETE" to confirm' }) }).strict();

/**
 * Permanently delete the signed-in user's account and data. Requires a typed
 * confirmation AND a recent sign-in, so an old or stolen session can't do it.
 */
export const DELETE = authed(async ({ user, body, req }) => {
  await body(schema);
  if (!user.authTime || Date.now() / 1000 - user.authTime > REAUTH_WINDOW_SEC) {
    throw new FamilyError(401, "reauth_required", "For your security, please sign in again before deleting your account.");
  }
  await deleteAccount(user, clientIp(req.headers));
  const res = { ok: true };
  return res;
});
