import { getAdminStats } from "@/lib/admin/stats.server";
import { authed } from "@/lib/api/handler";
import { FamilyError } from "@/lib/families/errors";
import { clientIp } from "@/lib/rate-limit";
import { logSecurityEvent } from "@/lib/security/events.server";

export const runtime = "nodejs";

/**
 * Admin-only aggregates. Admin = Firebase custom claim `admin: true`, set
 * only with service-account credentials (scripts/set-admin.mjs). A profile
 * field can never grant it.
 */
export const GET = authed(async ({ user, req }) => {
  if (!user.isAdmin) {
    void logSecurityEvent("admin_denied", { uid: user.uid, ip: clientIp(req.headers), route: "/api/admin/stats" });
    throw new FamilyError(403, "forbidden", "Administrator access required.");
  }
  return getAdminStats();
});
