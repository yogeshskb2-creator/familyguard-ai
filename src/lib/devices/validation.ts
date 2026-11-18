import { z } from "zod";
import { notFound } from "@/lib/families/errors";

export const DEVICE_LIMITS = { maxActivePerUser: 10, onlineWindowMs: 10 * 60_000, sendingWindowMs: 2 * 60_000, heartbeatMinMs: 60_000 } as const;

const deviceName = z
  .string()
  .trim()
  .min(1, "Enter a name")
  .max(40, "Keep the name under 40 characters")
  .regex(/^[^<>{}\\]*$/, "Name contains characters that aren't allowed");

export const registerDeviceSchema = z
  .object({
    name: deviceName,
    type: z.enum(["web", "android", "ios", "tablet"]),
    /** Short platform summary like "Chrome on Android" — never the full user-agent string. */
    platform: z.string().trim().max(60).regex(/^[^<>{}\\]*$/),
  })
  .strict();

export const renameDeviceSchema = z.object({ name: deviceName }).strict();

/** FCM registration tokens are long opaque strings. */
export const pushTokenSchema = z.object({ token: z.string().min(20).max(4096).regex(/^[A-Za-z0-9_:\-.]+$/) }).strict();

/** Validate a `[deviceId]` route param; malformed ids are simply "not found". */
export function deviceIdParam(p: { deviceId: string }): string {
  const r = z.string().regex(/^[A-Za-z0-9_-]{6,128}$/).safeParse(p.deviceId);
  if (!r.success) throw notFound();
  return r.data;
}
