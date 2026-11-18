import { z } from "zod";

export const emailSchema = z.string().trim().toLowerCase().pipe(z.email({ message: "Enter a valid email address" }));

/** Firebase hashes passwords (scrypt); we only enforce strength client- and server-side. */
export const passwordSchema = z
  .string()
  .min(8, "Use at least 8 characters")
  .max(128, "Use at most 128 characters")
  .regex(/[A-Za-z]/, "Include at least one letter")
  .regex(/[0-9]/, "Include at least one number");

export const displayNameSchema = z
  .string()
  .trim()
  .min(2, "Name must be at least 2 characters")
  .max(60, "Name must be at most 60 characters")
  .regex(/^[^<>{}\\]*$/, "Name contains characters that aren't allowed");

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Enter your password"),
});

export const registerSchema = z
  .object({
    displayName: displayNameSchema,
    email: emailSchema,
    password: passwordSchema,
    confirmPassword: z.string(),
    acceptTerms: z.literal(true, { message: "You must accept the terms and privacy policy" }),
  })
  .refine((v) => v.password === v.confirmPassword, {
    path: ["confirmPassword"],
    message: "Passwords don't match",
  });

/** E.164: + then 8–15 digits. Spaces/dashes are stripped before validation. */
export const phoneSchema = z
  .string()
  .transform((v) => v.replace(/[\s()-]/g, ""))
  .pipe(z.string().regex(/^\+[1-9]\d{7,14}$/, "Use international format, e.g. +91 98765 43210"));

export const otpSchema = z.string().trim().regex(/^\d{6}$/, "Enter the 6-digit code");

export const aiProviderSchema = z.enum(["claude", "openai", "gemini"]);

/** The ONLY profile fields a user may change. Anything else is rejected. */
export const profileUpdateSchema = z
  .object({
    displayName: displayNameSchema.optional(),
    aiProvider: aiProviderSchema.optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).length > 0, { message: "Nothing to update" });

export const sessionRequestSchema = z.object({
  idToken: z.string().min(20).max(4096),
});

export type LoginInput = z.infer<typeof loginSchema>;
export type RegisterInput = z.input<typeof registerSchema>;
export type ProfileUpdate = z.infer<typeof profileUpdateSchema>;

/** Flatten a ZodError to { field: firstMessage } for form display. */
export function fieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "_form";
    out[key] ??= issue.message;
  }
  return out;
}
