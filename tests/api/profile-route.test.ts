import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/security/rate-limit.server", async () => (await import("./security-stubs")).rateLimitStub);
vi.mock("@/lib/security/events.server", async () => (await import("./security-stubs")).eventsStub);
const verifySessionCookie = vi.fn();
vi.mock("@/lib/firebase/admin", () => ({
  isAdminConfigured: () => true,
  adminAuth: () => ({ verifySessionCookie }),
}));
const updateUserProfile = vi.fn(async (uid: string, u: object) => ({ uid, ...u }));
const getUserProfile = vi.fn(async (uid: string) => ({ uid, displayName: "Ann" }));
vi.mock("@/lib/users/profile.server", () => ({ updateUserProfile, getUserProfile }));

const decoded = { uid: "u1", email: "a@x.co", email_verified: true, firebase: { sign_in_provider: "password" } };
const req = (method: string, body?: unknown, extra: Record<string, string> = {}) =>
  new NextRequest("http://fg.test/api/profile", {
    method,
    headers: { origin: "http://fg.test", host: "fg.test", cookie: "__session=valid", ...extra },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

beforeEach(() => {
  vi.clearAllMocks();
  verifySessionCookie.mockResolvedValue(decoded);
});

describe("/api/profile", async () => {
  const { GET, PATCH } = await import("@/app/api/profile/route");

  it("returns 401 without a valid session", async () => {
    verifySessionCookie.mockRejectedValue(new Error("revoked"));
    expect((await GET(req("GET"))).status).toBe(401);
    expect((await PATCH(req("PATCH", { displayName: "Zed" }))).status).toBe(401);
    expect(updateUserProfile).not.toHaveBeenCalled();
  });

  it("returns only the caller's own profile", async () => {
    const res = await GET(req("GET"));
    expect(res.status).toBe(200);
    expect(getUserProfile).toHaveBeenCalledWith("u1");
  });

  it("updates whitelisted fields for the session user only", async () => {
    const res = await PATCH(req("PATCH", { displayName: "Ann B", aiProvider: "openai" }));
    expect(res.status).toBe(200);
    expect(updateUserProfile).toHaveBeenCalledWith("u1", { displayName: "Ann B", aiProvider: "openai" });
  });

  it("rejects attempts to set admin/role/familyIds", async () => {
    for (const body of [{ admin: true }, { role: "admin" }, { displayName: "Ann", familyIds: ["f"] }]) {
      expect((await PATCH(req("PATCH", body))).status).toBe(400);
    }
    expect(updateUserProfile).not.toHaveBeenCalled();
  });

  it("rejects cross-site updates", async () => {
    expect((await PATCH(req("PATCH", { displayName: "Ann" }, { origin: "https://evil.example" }))).status).toBe(403);
  });
});
