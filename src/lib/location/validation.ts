import { z } from "zod";
import { docIdSchema } from "@/lib/families/validation";

export const RETENTION_DAYS = [1, 7, 30] as const;

/** A single fix from the browser Geolocation API. */
export const locationUpdateSchema = z
  .object({
    lat: z.number().finite().min(-90).max(90),
    lng: z.number().finite().min(-180).max(180),
    accuracy: z.number().finite().positive().max(100_000),
    heading: z.number().finite().min(0).lt(360).nullable().optional(),
    speed: z.number().finite().min(0).max(150).nullable().optional(), // m/s
    /** When the fix was taken (client clock). */
    timestamp: z.number().int().positive(),
    /** The registered device this fix came from (optional; must be the caller's own). */
    deviceId: docIdSchema.optional(),
  })
  .strict();

export const startSharingSchema = z
  .object({
    familyIds: z.array(docIdSchema).min(1, "Choose at least one family to share with").max(5),
    keepHistory: z.boolean(),
    historyRetentionDays: z.union([z.literal(1), z.literal(7), z.literal(30)]),
  })
  .strict();

export const updateSharingSchema = startSharingSchema.partial().strict().refine((v) => Object.keys(v).length > 0, {
  message: "Nothing to update",
});

/** Reject fixes from the future or too old to be "live". */
export const MAX_FIX_AGE_MS = 2 * 60_000;
export const MAX_CLOCK_SKEW_MS = 30_000;
export function isFreshFix(timestamp: number, now = Date.now()): boolean {
  return timestamp <= now + MAX_CLOCK_SKEW_MS && now - timestamp <= MAX_FIX_AGE_MS;
}

export type LocationUpdate = z.infer<typeof locationUpdateSchema>;
export type StartSharing = z.infer<typeof startSharingSchema>;
