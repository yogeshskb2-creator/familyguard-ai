import { authed } from "@/lib/api/handler";
import { FamilyError } from "@/lib/families/errors";
import { PROVIDER_LABEL, askAssistant, configuredProviders, modelFor } from "@/lib/ai/providers.server";
import { quickAnswer } from "@/lib/ai/quick.server";
import { assistantRequestSchema } from "@/lib/ai/validation";
import { createGlobalRateLimiter } from "@/lib/security/rate-limit.server";
import { getUserProfile } from "@/lib/users/profile.server";

export const runtime = "nodejs";
export const maxDuration = 60;

// AI calls cost money: cap per user per minute and per day (per server instance).
const perMinute = createGlobalRateLimiter({ name: "ai-min", limit: 10, windowMs: 60_000 });
const perDay = createGlobalRateLimiter({ name: "ai-day", limit: 200, windowMs: 24 * 60 * 60_000 });

/** Which assistants are available (names + models only — never keys). */
export const GET = authed(async ({ user }) => {
  const profile = await getUserProfile(user.uid);
  return {
    providers: configuredProviders().map((p) => ({ id: p, label: PROVIDER_LABEL[p], model: modelFor(p) })),
    preferred: profile?.aiProvider ?? "claude",
  };
});

export const POST = authed(async ({ user, body }) => {
  const { provider, messages } = await body(assistantRequestSchema);
  const question = messages[messages.length - 1]!.content;

  if (provider === "quick") {
    const { text } = await quickAnswer(question, user);
    return { text, provider: "quick", model: null, toolsUsed: [] };
  }
  if (!configuredProviders().includes(provider)) {
    throw new FamilyError(503, "ai_not_configured", `${PROVIDER_LABEL[provider]} isn't configured on this server.`);
  }
  if (!(await perMinute(user.uid)).ok || !(await perDay(user.uid)).ok) {
    throw new FamilyError(429, "rate_limited", "You've asked a lot of questions — please wait a little before asking more.");
  }
  return askAssistant(user, provider, messages);
});
