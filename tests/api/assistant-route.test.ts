import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/security/rate-limit.server", async () => (await import("./security-stubs")).rateLimitStub);
vi.mock("@/lib/security/events.server", async () => (await import("./security-stubs")).eventsStub);
const verifySessionCookie = vi.fn();
vi.mock("@/lib/firebase/admin", () => ({ isAdminConfigured: () => true, adminAuth: () => ({ verifySessionCookie }) }));
const ai = vi.hoisted(() => ({ ask: vi.fn(), configured: vi.fn(() => ["claude"]) }));
vi.mock("@/lib/ai/providers.server", () => ({
  askAssistant: ai.ask,
  configuredProviders: ai.configured,
  modelFor: () => "claude-opus-5-5",
  PROVIDER_LABEL: { claude: "Claude", openai: "OpenAI", gemini: "Gemini" },
}));
const quick = vi.hoisted(() => ({ answer: vi.fn(async () => ({ text: "2 people are sharing.", intent: "sharing" })) }));
vi.mock("@/lib/ai/quick.server", () => ({ quickAnswer: quick.answer }));
vi.mock("@/lib/users/profile.server", () => ({ getUserProfile: async () => ({ aiProvider: "gemini" }) }));

let uid = 0;
const decoded = () => ({ uid: `u${uid}`, email: "a@x.co", email_verified: true, firebase: { sign_in_provider: "password" } });
const req = (method: string, body?: unknown, headers: Record<string, string> = {}) =>
  new NextRequest("http://fg.test/api/assistant", {
    method,
    headers: { origin: "http://fg.test", host: "fg.test", cookie: "__session=x", ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
const route = { params: Promise.resolve({}) };
const q = (provider: string) => ({ provider, messages: [{ role: "user", content: "Who is sharing?" }] });

beforeEach(() => {
  vi.clearAllMocks();
  uid++;
  verifySessionCookie.mockResolvedValue(decoded());
  ai.ask.mockResolvedValue({ text: "Answer", provider: "claude", model: "claude-opus-5-5", toolsUsed: [], refused: false });
});

describe("/api/assistant", async () => {
  const { GET, POST } = await import("@/app/api/assistant/route");

  it("requires sign-in", async () => {
    verifySessionCookie.mockRejectedValue(new Error("no"));
    expect((await POST(req("POST", q("claude")), route)).status).toBe(401);
    expect(ai.ask).not.toHaveBeenCalled();
  });

  it("lists configured providers by name and model only — never keys", async () => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-super-secret";
    const body = await (await GET(req("GET"), route)).json();
    expect(body).toEqual({ providers: [{ id: "claude", label: "Claude", model: "claude-opus-5-5" }], preferred: "gemini" });
    expect(JSON.stringify(body)).not.toContain("sk-ant");
  });

  it("passes the SESSION user (not anything from the body) to the assistant", async () => {
    await POST(req("POST", q("claude")), route);
    expect(ai.ask.mock.calls[0]![0].uid).toBe(`u${uid}`);
  });

  it("serves quick answers without any AI provider", async () => {
    ai.configured.mockReturnValueOnce([]);
    const res = await POST(req("POST", q("quick")), route);
    expect(await res.json()).toMatchObject({ text: "2 people are sharing.", provider: "quick" });
    expect(ai.ask).not.toHaveBeenCalled();
  });

  it("rejects unconfigured providers with 503", async () => {
    const res = await POST(req("POST", q("openai")), route);
    expect(res.status).toBe(503);
    expect((await res.json()).error.code).toBe("ai_not_configured");
  });

  it("rate-limits AI calls per user (cost protection)", async () => {
    const statuses = [];
    for (let i = 0; i < 11; i++) statuses.push((await POST(req("POST", q("claude")), route)).status);
    expect(statuses.slice(0, 10).every((s) => s === 200)).toBe(true);
    expect(statuses[10]).toBe(429);
  });

  it("rejects cross-site requests", async () => {
    expect((await POST(req("POST", q("claude"), { origin: "https://evil.example" }), route)).status).toBe(403);
  });
});
