import { createHash } from "node:crypto";

/*
 * Privacy helpers for security logging: admins must be able to spot abuse
 * patterns without the log becoming a tracking database of users.
 */

/** Pseudonymous, stable id for a user in logs (salted SHA-256, truncated). */
export function hashId(id: string, salt = process.env.SECURITY_LOG_SALT || "familyguard-default-salt"): string {
  return createHash("sha256").update(`${salt}:${id}`).digest("hex").slice(0, 16);
}

/** Keep only the network part of an IP: IPv4 → /24, IPv6 → /48. */
export function truncateIp(ip: string | null | undefined): string | null {
  if (!ip || ip === "unknown") return null;
  const v4 = ip.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.\d{1,3}$/);
  if (v4) return `${v4[1]}.${v4[2]}.${v4[3]}.0/24`;
  if (ip.includes(":")) {
    const parts = ip.split(":").filter((p, i, a) => p !== "" || (i > 0 && i < a.length - 1));
    return `${parts.slice(0, 3).join(":")}::/48`;
  }
  return null;
}
