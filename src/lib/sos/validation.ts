import { z } from "zod";
import { docIdSchema } from "@/lib/families/validation";
import { phoneSchema } from "@/lib/validation/auth";

export const SOS_LIMITS = { maxPerWindow: 3, windowMs: 10 * 60_000, messageMax: 200 } as const;

export const sendSosSchema = z
  .object({
    /** Families to alert. Omitted = all of the sender's families. */
    familyIds: z.array(docIdSchema).min(1).max(5).optional(),
    /** One-time location for THIS alert only — included only if the user left it switched on. */
    location: z
      .object({
        lat: z.number().finite().min(-90).max(90),
        lng: z.number().finite().min(-180).max(180),
        accuracy: z.number().finite().positive().max(100_000),
      })
      .strict()
      .nullable()
      .optional(),
    message: z
      .string()
      .trim()
      .max(SOS_LIMITS.messageMax, `Keep the message under ${SOS_LIMITS.messageMax} characters`)
      .regex(/^[^<>{}\\]*$/, "Message contains characters that aren't allowed")
      .optional(),
  })
  .strict();

export const resolveSosSchema = z.object({ outcome: z.enum(["resolved", "cancelled"]) }).strict();

export const emergencyContactSchema = z
  .object({
    name: z.string().trim().min(2, "Enter a name").max(60).regex(/^[^<>{}\\]*$/, "Name contains characters that aren't allowed"),
    phone: phoneSchema,
    relationship: z.string().trim().max(30).regex(/^[^<>{}\\]*$/).optional().default(""),
  })
  .strict();

export const emergencySettingsSchema = z
  .object({
    contacts: z.array(emergencyContactSchema).max(5, "You can save up to 5 emergency contacts"),
    /** Local emergency services number, e.g. 112 (EU/India), 911 (US), 999 (UK). */
    emergencyNumber: z.string().trim().regex(/^\d{2,6}$/, "Enter a number like 112 or 911"),
  })
  .strict();

export type SendSos = z.infer<typeof sendSosSchema>;
export type EmergencySettings = z.infer<typeof emergencySettingsSchema>;
