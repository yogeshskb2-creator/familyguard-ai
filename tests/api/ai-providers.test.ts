import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

// ── Scripted SDK stand-ins ─────────────────────────────────
const sdk = vi.hoisted(() => ({
  anthropicCreate: vi.fn(),
  anthropicCtor: vi.fn(),
  openaiCreate: vi.fn(),
  geminiGenerate: vi.fn(),
}));
vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    beta = { messages: { create: sdk.anthropicCreate } };
    constructor(opts: unknown) {
      sdk.anthropicCtor(opts);
    }
  },
}));
vi.mock("openai", () => ({
  default: class {
    chat = { completions: { create: sdk.openaiCreate } };
  },
}));
vi.mock("@google/genai", () => ({
  GoogleGenAI: class {
    models = { generateContent: sdk.geminiGenerate };
  },
}));

const tools = vi.hoisted(() => ({ execute: vi.fn() }));
vi.mock("@/lib/ai/tools.server", async () => {
  const real = await vi.importActual<typeof import("@/lib/ai/tools.server")>("@/lib/ai/tools.server");
  return { ...real, executeTool: tools.execute };
});
vi.mock("@/lib/families/service.server", () => ({}));
vi.mock("@/lib/families/events.server", () => ({}));
vi.mock("@/lib/geofences/service.server", () => ({}));
vi.mock("@/lib/location/service.server", () => ({}));
vi.mock("@/lib/sos/service.server", () => ({}));

import { askAssistant, configuredProviders, MAX_STEPS } from "@/lib/ai/providers.server";
import { FamilyError } from "@/lib/families/errors";
import type { SessionUser } from "@/lib/auth/session";

const user: SessionUser = {
  uid: "u-ann",
  email: "ann@example.com",
  emailVerified: true,
  displayName: "Ann",
  phoneNumber: null,
  photoURL: null,
  signInProvider: "password",
  isAdmin: false,
};
const ask = (p: "claude" | "openai" | "gemini") => askAssistant(user, p, [{ role: "user", content: "Who is sharing?" }]);

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  process.env.ANTHROPIC_API_KEY = "sk-ant-test-secret";
  process.env.OPENAI_API_KEY = "sk-openai-test-secret";
  process.env.GEMINI_API_KEY = "gemini-test-secret";
  delete process.env.CLAUDE_MODEL;
  tools.execute.mockResolvedValue({ ok: true, content: '{"families":[]}' });
});

describe("provider configuration", () => {
  it("lists only providers whose key is set", () => {
    delete process.env.OPENAI_API_KEY;
    process.env.GEMINI_API_KEY = "   ";
    expect(configuredProviders()).toEqual(["claude"]);
  });
  it("refuses an unconfigured provider without calling it", async () => {
    delete process.env.OPENAI_API_KEY;
    await expect(ask("openai")).rejects.toMatchObject({ status: 503, code: "ai_not_configured" });
    expect(sdk.openaiCreate).not.toHaveBeenCalled();
  });
});

describe("Claude adapter", () => {
  it("runs the tool loop as the SESSION user and returns the final text", async () => {
    sdk.anthropicCreate
      .mockResolvedValueOnce({
        stop_reason: "tool_use",
        content: [{ type: "tool_use", id: "t1", name: "get_shared_locations", input: { uid: "someone-else" } }],
      })
      .mockResolvedValueOnce({ stop_reason: "end_turn", content: [{ type: "text", text: "Meera is at Home." }] });

    const res = await ask("claude");
    expect(res).toMatchObject({ text: "Meera is at Home.", provider: "claude", model: "claude-opus-5-5", toolsUsed: ["get_shared_locations"] });
    // Model-supplied input is ignored: the tool runs for the session user only.
    expect(tools.execute).toHaveBeenCalledWith("get_shared_locations", user);
    const second = sdk.anthropicCreate.mock.calls[1]![0];
    expect(second.messages.at(-1).content[0]).toMatchObject({ type: "tool_result", tool_use_id: "t1" });
  });

  it("sends the recommended request shape", async () => {
    sdk.anthropicCreate.mockResolvedValueOnce({ stop_reason: "end_turn", content: [{ type: "text", text: "ok" }] });
    await ask("claude");
    const req = sdk.anthropicCreate.mock.calls[0]![0];
    expect(req.model).toBe("claude-opus-5-5");
    expect(req.output_config).toEqual({ effort: "low" });
    expect(req.betas).toEqual(["server-side-fallback-2026-07-01"]);
    expect(req.fallbacks).toBe("default");
    expect(req.tool_choice).toBeUndefined(); // forced tool choice is rejected by this model
    expect(req.thinking).toBeUndefined(); // can't be disabled; effort controls depth
    expect(req.tools.every((t: { strict: boolean; input_schema: { additionalProperties: boolean } }) => t.strict && t.input_schema.additionalProperties === false)).toBe(true);
    expect(req.tools.map((t: { name: string }) => t.name)).toEqual([
      "list_family_members",
      "get_shared_locations",
      "get_recent_sos_alerts",
      "get_safe_zones",
      "get_recent_activity",
      "get_my_sharing_status",
    ]);
    expect(sdk.anthropicCtor).toHaveBeenCalledWith(expect.objectContaining({ apiKey: "sk-ant-test-secret", maxRetries: 1 }));
  });

  it("marks failing tools as errors instead of crashing", async () => {
    tools.execute.mockResolvedValueOnce({ ok: false, content: '{"error":"unavailable"}' });
    sdk.anthropicCreate
      .mockResolvedValueOnce({ stop_reason: "tool_use", content: [{ type: "tool_use", id: "t1", name: "get_safe_zones", input: {} }] })
      .mockResolvedValueOnce({ stop_reason: "end_turn", content: [{ type: "text", text: "Sorry." }] });
    await ask("claude");
    expect(sdk.anthropicCreate.mock.calls[1]![0].messages.at(-1).content[0].is_error).toBe(true);
  });

  it("handles a refusal with a safe message", async () => {
    sdk.anthropicCreate.mockResolvedValueOnce({ stop_reason: "refusal", content: [] });
    const res = await ask("claude");
    expect(res.refused).toBe(true);
    expect(res.text).toMatch(/SOS button/);
  });

  it(`stops after ${MAX_STEPS} tool rounds instead of looping forever`, async () => {
    sdk.anthropicCreate.mockResolvedValue({ stop_reason: "tool_use", content: [{ type: "tool_use", id: "t", name: "get_safe_zones", input: {} }] });
    const res = await ask("claude");
    expect(sdk.anthropicCreate).toHaveBeenCalledTimes(MAX_STEPS);
    expect(res.text).toMatch(/couldn't finish/);
  });

  it("maps auth errors to a safe message that never leaks the key or provider text", async () => {
    sdk.anthropicCreate.mockRejectedValueOnce(Object.assign(new Error("invalid x-api-key sk-ant-test-secret"), { status: 401 }));
    const err = await ask("claude").catch((e) => e);
    expect(err).toBeInstanceOf(FamilyError);
    expect(err).toMatchObject({ status: 503, code: "ai_misconfigured" });
    expect(err.message).not.toContain("sk-ant");
  });

  it("maps rate limits and outages", async () => {
    sdk.anthropicCreate.mockRejectedValueOnce(Object.assign(new Error("slow down"), { status: 429 }));
    await expect(ask("claude")).rejects.toMatchObject({ code: "ai_busy" });
    sdk.anthropicCreate.mockRejectedValueOnce(new Error("socket hang up"));
    await expect(ask("claude")).rejects.toMatchObject({ status: 502, code: "ai_unavailable" });
  });

  it("honours a CLAUDE_MODEL override", async () => {
    process.env.CLAUDE_MODEL = "claude-sonnet-5-5";
    sdk.anthropicCreate.mockResolvedValueOnce({ stop_reason: "end_turn", content: [{ type: "text", text: "ok" }] });
    expect((await ask("claude")).model).toBe("claude-sonnet-5-5");
  });
});

describe("OpenAI adapter", () => {
  it("runs function calls as the session user and returns the answer", async () => {
    sdk.openaiCreate
      .mockResolvedValueOnce({
        choices: [{ finish_reason: "tool_calls", message: { role: "assistant", content: null, tool_calls: [{ id: "c1", type: "function", function: { name: "get_recent_sos_alerts", arguments: "{}" } }] } }],
      })
      .mockResolvedValueOnce({ choices: [{ finish_reason: "stop", message: { role: "assistant", content: "No SOS alerts." } }] });
    const res = await ask("openai");
    expect(res).toMatchObject({ text: "No SOS alerts.", provider: "openai", model: "gpt-5.5", toolsUsed: ["get_recent_sos_alerts"] });
    expect(tools.execute).toHaveBeenCalledWith("get_recent_sos_alerts", user);
    const msgs = sdk.openaiCreate.mock.calls[1]![0].messages;
    expect(msgs[0]).toMatchObject({ role: "system" });
    expect(msgs.at(-1)).toMatchObject({ role: "tool", tool_call_id: "c1" });
    expect(sdk.openaiCreate.mock.calls[0]![0].tools[0]).toMatchObject({ type: "function", function: { strict: true } });
  });
  it("treats content filtering as a refusal", async () => {
    sdk.openaiCreate.mockResolvedValueOnce({ choices: [{ finish_reason: "content_filter", message: { role: "assistant", content: null } }] });
    expect((await ask("openai")).refused).toBe(true);
  });
});

describe("Gemini adapter", () => {
  it("runs function calls and returns functionResponse parts", async () => {
    sdk.geminiGenerate
      .mockResolvedValueOnce({ functionCalls: [{ id: "f1", name: "list_family_members", args: {} }], candidates: [{ content: { role: "model", parts: [{ functionCall: { name: "list_family_members" } }] } }] })
      .mockResolvedValueOnce({ functionCalls: undefined, text: "You have 3 family members." });
    const res = await ask("gemini");
    expect(res).toMatchObject({ text: "You have 3 family members.", provider: "gemini", toolsUsed: ["list_family_members"] });
    expect(tools.execute).toHaveBeenCalledWith("list_family_members", user);
    const contents = sdk.geminiGenerate.mock.calls[1]![0].contents;
    expect(contents.at(-1).parts[0].functionResponse).toMatchObject({ id: "f1", name: "list_family_members", response: { output: { families: [] } } });
    expect(sdk.geminiGenerate.mock.calls[0]![0].config.systemInstruction).toMatch(/FamilyGuard AI/);
  });
  it("treats a blocked prompt as a refusal", async () => {
    sdk.geminiGenerate.mockResolvedValueOnce({ promptFeedback: { blockReason: "SAFETY" } });
    expect((await ask("gemini")).refused).toBe(true);
  });
  it("recognises Gemini's 400 'API key not valid' as misconfiguration", async () => {
    sdk.geminiGenerate.mockRejectedValueOnce(Object.assign(new Error("API key not valid. Please pass a valid API key."), { status: 400 }));
    await expect(ask("gemini")).rejects.toMatchObject({ code: "ai_misconfigured" });
  });
});
