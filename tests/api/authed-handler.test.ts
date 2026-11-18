import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

vi.mock("server-only", () => ({}));
import { securityEvents } from "./security-stubs";
vi.mock("@/lib/security/rate-limit.server", async () => (await import("./security-stubs")).rateLimitStub);
vi.mock("@/lib/security/events.server", async () => (await import("./security-stubs")).eventsStub);
const verifySessionCookie = vi.fn();
vi.mock("@/lib/firebase/admin", () => ({ isAdminConfigured: () => true, adminAuth: () => ({ verifySessionCookie }) }));

const decoded = (over = {}) => ({ uid: "u1", email: "a@x.co", email_verified: true, firebase: { sign_in_provider: "password" }, ...over });
const req = (method: string, body?: unknown, headers: Record<string, string> = {}) =>
  new NextRequest("http://fg.test/api/x", {
    method,
    headers: { origin: "http://fg.test", host: "fg.test", cookie: "__session=c", ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
const route = { params: Promise.resolve({}) };

beforeEach(() => {
  vi.clearAllMocks();
  verifySessionCookie.mockResolvedValue(decoded());
});

describe("authed() API wrapper", async () => {
  const { authed } = await import("@/lib/api/handler");
  const { FamilyError } = await import("@/lib/families/errors");

  it("passes the verified user to the handler", async () => {
    const h = authed(async ({ user }) => ({ uid: user.uid }));
    const res = await h(req("GET"), route);
    expect(await res.json()).toEqual({ uid: "u1" });
  });

  it("401s without a valid session and never runs the handler", async () => {
    verifySessionCookie.mockRejectedValue(new Error("revoked"));
    const fn = vi.fn();
    expect((await authed(fn)(req("GET"), route)).status).toBe(401);
    expect(fn).not.toHaveBeenCalled();
    expect(securityEvents.at(-1)).toMatchObject({ type: "session_rejected", ctx: { route: "/api/x" } }); // a cookie was presented
  });

  it("403s for unverified email accounts", async () => {
    verifySessionCookie.mockResolvedValue(decoded({ email_verified: false }));
    expect((await authed(async () => ({}))(req("GET"), route)).status).toBe(403);
  });

  it("403s cross-site mutations before touching the session", async () => {
    const res = await authed(async () => ({}))(req("POST", {}, { origin: "https://evil.example" }), route);
    expect(res.status).toBe(403);
    expect(verifySessionCookie).not.toHaveBeenCalled();
  });

  it("maps validation errors to 400 with field messages", async () => {
    const h = authed(async ({ body }) => body(z.object({ name: z.string().min(2, "Too short") })));
    const res = await h(req("POST", { name: "x" }), route);
    expect(res.status).toBe(400);
    expect((await res.json()).error.fields).toEqual({ name: "Too short" });
  });

  it("maps domain errors to their status", async () => {
    const res = await authed(async () => {
      throw new FamilyError(409, "already_member", "Already in");
    })(req("POST", {}), route);
    expect(res.status).toBe(409);
    expect((await res.json()).error.code).toBe("already_member");
  });

  it("hides unexpected errors behind a generic 500", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await authed(async () => {
      throw new Error("db password is hunter2");
    })(req("POST", {}), route);
    expect(res.status).toBe(500);
    expect(JSON.stringify(await res.json())).not.toContain("hunter2");
  });

  it("rate-limits mutations per user", async () => {
    verifySessionCookie.mockResolvedValue(decoded({ uid: "spammer" }));
    const h = authed(async () => ({}));
    const statuses = [];
    for (let i = 0; i < 32; i++) statuses.push((await h(req("POST", {}), route)).status);
    expect(statuses.filter((s) => s === 429)).toHaveLength(2);
  });
});
