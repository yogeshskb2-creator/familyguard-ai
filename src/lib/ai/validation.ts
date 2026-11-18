import { z } from "zod";

export const ASSISTANT_LIMITS = { maxTurns: 20, maxChars: 2000 } as const;

/**
 * The browser sends only plain text turns. Tool calls/results are never
 * accepted from the client — they're always recomputed server-side, so a
 * client can't feed the model forged "data".
 */
export const assistantRequestSchema = z
  .object({
    provider: z.enum(["claude", "openai", "gemini", "quick"]),
    messages: z
      .array(
        z
          .object({
            role: z.enum(["user", "assistant"]),
            content: z.string().trim().min(1).max(ASSISTANT_LIMITS.maxChars, `Keep messages under ${ASSISTANT_LIMITS.maxChars} characters`),
          })
          .strict(),
      )
      .min(1)
      .max(ASSISTANT_LIMITS.maxTurns)
      .refine((m) => m[m.length - 1]!.role === "user", { message: "The last message must be from you" }),
  })
  .strict();
