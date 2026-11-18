import "server-only";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { adminDb, isAdminConfigured } from "@/lib/firebase/admin";
import { hashId, truncateIp } from "./privacy";

/*
 * securityEvents/{id} — an append-only log for administrators.
 *  - Server-written only; no client read access (admins read via the server).
 *  - Pseudonymous: uidHash (salted hash) and a truncated IP — never emails,
 *    names, locations or raw IPs.
 *  - Auto-expires after 90 days (TTL policy on `expireAt`).
 */

export type SecurityEventType =
  | "auth_invalid_token"
  | "auth_stale_sign_in"
  | "auth_unverified_email"
  | "session_rejected"
  | "csrf_blocked"
  | "rate_limited"
  | "admin_denied"
  | "admin_access"
  | "sign_out_everywhere"
  | "account_deleted"
  | "location_data_deleted";

export const SECURITY_EVENT_LABEL: Record<SecurityEventType, string> = {
  auth_invalid_token: "Invalid sign-in token",
  auth_stale_sign_in: "Stale sign-in rejected",
  auth_unverified_email: "Unverified email blocked",
  session_rejected: "Invalid/revoked session",
  csrf_blocked: "Cross-site request blocked",
  rate_limited: "Rate limit hit",
  admin_denied: "Admin access denied",
  admin_access: "Admin console opened",
  sign_out_everywhere: "Signed out everywhere",
  account_deleted: "Account deleted",
  location_data_deleted: "Location data deleted",
};

const RETENTION_MS = 90 * 24 * 60 * 60 * 1000;

/** Best-effort: never throws, never blocks the request on failure. */
export async function logSecurityEvent(
  type: SecurityEventType,
  ctx: { uid?: string | null; ip?: string | null; route?: string; detail?: string } = {},
): Promise<void> {
  if (!isAdminConfigured()) return;
  try {
    await adminDb()
      .collection("securityEvents")
      .add({
        type,
        uidHash: ctx.uid ? hashId(ctx.uid) : null,
        ipPrefix: truncateIp(ctx.ip),
        route: ctx.route ?? null,
        detail: ctx.detail?.slice(0, 120) ?? null,
        at: FieldValue.serverTimestamp(),
        expireAt: Timestamp.fromMillis(Date.now() + RETENTION_MS),
      });
  } catch (err) {
    console.error("[security-event]", type, err);
  }
}
