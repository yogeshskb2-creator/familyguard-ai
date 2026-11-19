import { z } from "zod";
import { emailSchema, phoneSchema } from "@/lib/validation/auth";

export const familyNameSchema = z
  .string()
  .trim()
  .min(2, "Family name must be at least 2 characters")
  .max(40, "Family name must be at most 40 characters")
  .regex(/^[^<>{}\\]*$/, "Name contains characters that aren't allowed");

export const createFamilySchema = z.object({ name: familyNameSchema }).strict();
export const renameFamilySchema = createFamilySchema;

/**
 * At most one of email / phone. With one, the invitation also shows up for
 * whoever signs in with that verified email / phone. With neither, it is a
 * link-only invitation: whoever opens the private join link can accept it.
 */
export const inviteSchema = z
  .object({
    email: emailSchema.optional(),
    phone: phoneSchema.optional(),
    role: z.enum(["guardian", "member"]).default("member"),
  })
  .strict()
  .refine((v) => !(v.email && v.phone), {
    message: "Enter an email address or a phone number, not both",
    path: ["email"],
  });

/** Private join-link token: 24 random bytes, base64url (32 chars). */
export const joinTokenSchema = z.string().regex(/^[A-Za-z0-9_-]{32}$/);

export const changeRoleSchema = z.object({ role: z.enum(["guardian", "member"]) }).strict();

/** Firestore auto-IDs: 20 chars, [A-Za-z0-9]. Reject anything else before touching the DB. */
export const docIdSchema = z.string().regex(/^[A-Za-z0-9_-]{6,128}$/);

export type InviteInput = z.infer<typeof inviteSchema>;
