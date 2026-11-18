import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
import { securityEvents } from "./security-stubs";
vi.mock("@/lib/security/rate-limit.server", async () => (await import("./security-stubs")).rateLimitStub);
vi.mock("@/lib/security/events.server", async () => (await import("./security-stubs")).eventsStub);
const verifyIdToken = vi.fn();
const createSessionCookie = vi.fn(async () => "session-cookie-value");
const verifySessionCookie = vi.fn();
const revokeRefreshTokens = vi.fn();
vi.mock("@/lib/firebase/admin", () => ({
  isAdminConfigured: () => true,
  adminAuth: () => ({ verifyIdToken, createSessionCookie, verifySessionCookie, revokeRefreshTokens }),
}));
const ensureUserProfile = vi.fn(async (u: { uid: string; displayName: string }) => ({ ...u }));
vi.mock("@/lib/users/profile.server", () => ({ ensureUserProfile }));

const now = () => Math.floor(Date.now() / 1000);
const token = (over: Record<string, unknown> = {}) => ({
  uid: "u1",
  email: "a@example.com",
  email_verified: true,
  name: "Ann",
  auth_time: now(),
  firebase: { sign_in_provider: "password" },
  ...over,
});

let ip = 0;
function req(method: string, body?: unknown, headers: Record<string, string> = {}, url = "http://fg.test/api/auth/session") {
  return new NextRequest(url, {
    method,
    headers: { origin: "http://fg.test", host: "fg.test", "x-forwarded-for": `10.0.0.${++ip}`, ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}
const idToken = "x".repeat(40);

beforeEach(() => vi.clearAllMocks());

describe("POST /api/auth/session (login)", async () => {
  const { POST, DELETE } = await import("@/app/api/auth/session/route");

  it("sets an httpOnly session cookie for a verified, fresh sign-in", async () => {
    verifyIdToken.mockResolvedValue(token());
    const res = await POST(req("POST", { idToken }));
    expect(res.status).toBe(200);
    const cookie = res.headers.get("set-cookie")!;
    expect(cookie).toContain("__session=session-cookie-value");
    expect(cookie.toLowerCase()).toContain("httponly");
    expect(cookie.toLowerCase()).toContain("samesite=lax");
    expect(verifyIdToken).toHaveBeenCalledWith(idToken, true); // checks revocation
    expect(ensureUserProfile).toHaveBeenCalledOnce();
  });

  it("rejects cross-site requests (CSRF)", async () => {
    const res = await POST(req("POST", { idToken }, { origin: "https://evil.example" }));
    expect(res.status).toBe(403);
    expect(verifyIdToken).not.toHaveBeenCalled();
    expect(securityEvents.at(-1)).toMatchObject({ type: "csrf_blocked" });
  });

  it("rejects malformed bodies", async () => {
    expect((await POST(req("POST", { nope: 1 }))).status).toBe(400);
    expect((await POST(req("POST", { idToken: "short" }))).status).toBe(400);
  });

  it("rejects invalid or revoked tokens", async () => {
    verifyIdToken.mockRejectedValue(new Error("auth/id-token-revoked"));
    const res = await POST(req("POST", { idToken }));
    expect(res.status).toBe(401);
    expect(res.headers.get("set-cookie")).toBeNull();
    expect(securityEvents.at(-1)).toMatchObject({ type: "auth_invalid_token" });
  });

  it("refuses unverified email/password accounts (server-side enforcement)", async () => {
    verifyIdToken.mockResolvedValue(token({ email_verified: false }));
    const res = await POST(req("POST", { idToken }));
    expect(res.status).toBe(403);
    expect((await res.json()).error.code).toBe("email_not_verified");
    expect(createSessionCookie).not.toHaveBeenCalled();
  });

  it("allows phone sign-in without an email", async () => {
    verifyIdToken.mockResolvedValue(token({ email: undefined, email_verified: undefined, phone_number: "+15550001111", firebase: { sign_in_provider: "phone" } }));
    expect((await POST(req("POST", { idToken }))).status).toBe(200);
  });

  it("refuses to mint a session from a stale sign-in (stolen-token replay)", async () => {
    verifyIdToken.mockResolvedValue(token({ auth_time: now() - 3600 }));
    const res = await POST(req("POST", { idToken }));
    expect(res.status).toBe(401);
    expect((await res.json()).error.code).toBe("stale_sign_in");
  });

  it("rate-limits floods from one IP, but tolerates households sharing an IP (NAT)", async () => {
    verifyIdToken.mockRejectedValue(new Error("bad"));
    const fixed = { "x-forwarded-for": "203.0.113.9" };
    const statuses = [];
    for (let i = 0; i < 62; i++) statuses.push((await POST(req("POST", { idToken }, fixed))).status);
    expect(statuses.slice(0, 60).every((s) => s === 401)).toBe(true);
    expect(statuses.slice(60)).toEqual([429, 429]);
  });

  it("rate-limits repeated sign-ins to one account, whatever the IP", async () => {
    verifyIdToken.mockResolvedValue(token({ uid: "busy-account" }));
    const statuses = [];
    for (let i = 0; i < 11; i++) statuses.push((await POST(req("POST", { idToken }))).status); // a new IP each time
    expect(statuses.slice(0, 10).every((s) => s === 200)).toBe(true);
    expect(statuses[10]).toBe(429);
    expect(securityEvents.at(-1)).toMatchObject({ type: "rate_limited" });
    verifyIdToken.mockResolvedValue(token({ uid: "someone-else" }));
    expect((await POST(req("POST", { idToken }))).status).toBe(200); // other accounts unaffected
  });

  describe("DELETE /api/auth/session (logout)", () => {
    it("clears the cookie", async () => {
      const res = await DELETE(req("DELETE"));
      expect(res.status).toBe(200);
      expect(res.headers.get("set-cookie")).toMatch(/__session=;.*Max-Age=0/i);
      expect(revokeRefreshTokens).not.toHaveBeenCalled();
    });
    it("revokes all sessions with scope=all", async () => {
      verifySessionCookie.mockResolvedValue(token());
      const res = await DELETE(
        req("DELETE", undefined, { cookie: "__session=abc" }, "http://fg.test/api/auth/session?scope=all"),
      );
      expect(res.status).toBe(200);
      expect(revokeRefreshTokens).toHaveBeenCalledWith("u1");
    });
    it("rejects cross-site logout", async () => {
      expect((await DELETE(req("DELETE", undefined, { origin: "https://evil.example" }))).status).toBe(403);
    });
  });
});
