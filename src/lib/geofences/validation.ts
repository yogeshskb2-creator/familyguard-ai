import { z } from "zod";
import { docIdSchema } from "@/lib/families/validation";
import { ZONE_KINDS, ZONE_LIMITS } from "./zones";

const zoneName = z
  .string()
  .trim()
  .min(2, "Name must be at least 2 characters")
  .max(40, "Name must be at most 40 characters")
  .regex(/^[^<>{}\\]*$/, "Name contains characters that aren't allowed");

/** Shared field rules — NO defaults here (see updateZoneSchema). */
const zoneFields = {
  name: zoneName,
  kind: z.enum(ZONE_KINDS),
  lat: z.number().finite().min(-90).max(90),
  lng: z.number().finite().min(-180).max(180),
  radius: z
    .number()
    .int("Radius must be whole metres")
    .min(ZONE_LIMITS.minRadius, `Radius must be at least ${ZONE_LIMITS.minRadius} m`)
    .max(ZONE_LIMITS.maxRadius, `Radius must be at most ${ZONE_LIMITS.maxRadius / 1000} km`),
  alertsEnabled: z.boolean(),
  notifyOnEnter: z.boolean(),
  notifyOnExit: z.boolean(),
  /** Leaving raises a loud alarm for the family's owners and guardians. */
  alarmOnExit: z.boolean(),
  /** Members this zone applies to; empty = everyone in the family. */
  watchUids: z.array(docIdSchema).max(ZONE_LIMITS.maxWatched).transform((a) => [...new Set(a)]),
};

export const createZoneSchema = z
  .object({
    ...zoneFields,
    alertsEnabled: zoneFields.alertsEnabled.default(true),
    notifyOnEnter: zoneFields.notifyOnEnter.default(true),
    notifyOnExit: zoneFields.notifyOnExit.default(true),
    alarmOnExit: zoneFields.alarmOnExit.default(false),
    watchUids: zoneFields.watchUids.default([]),
  })
  .strict();

/**
 * Partial update. Built from the default-free fields on purpose: if defaults
 * leaked in, changing one toggle would silently reset the others to `true`.
 */
export const updateZoneSchema = z
  .object(zoneFields)
  .partial()
  .strict()
  .refine((v) => Object.keys(v).length > 0, { message: "Nothing to update" });

export type CreateZone = z.infer<typeof createZoneSchema>;
/** What callers may pass: the newer fields are optional and default off / everyone. */
export type CreateZoneInput = Omit<CreateZone, "alarmOnExit" | "watchUids"> & Partial<Pick<CreateZone, "alarmOnExit" | "watchUids">>;
