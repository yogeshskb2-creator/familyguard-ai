import { createRateLimiter } from "@/lib/rate-limit";

/**
 * Unit-test stand-ins for the Firestore-backed security modules. Each test
 * file wires them with its own (hoisted) vi.mock calls:
 *   vi.mock("@/lib/security/rate-limit.server", async () => (await import("./security-stubs")).rateLimitStub);
 *   vi.mock("@/lib/security/events.server", async () => (await import("./security-stubs")).eventsStub);
 */
export const securityEvents: { type: string; ctx: Record<string, unknown> }[] = [];

export const rateLimitStub = {
  createGlobalRateLimiter: ({ limit, windowMs }: { limit: number; windowMs: number }) => {
    const local = createRateLimiter({ limit, windowMs });
    return async (key: string) => local(key);
  },
};

export const eventsStub = {
  logSecurityEvent: async (type: string, ctx: Record<string, unknown> = {}) => {
    securityEvents.push({ type, ctx });
  },
};
