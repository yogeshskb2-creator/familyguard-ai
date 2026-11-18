import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
import { securityEvents } from "./security-stubs";
vi.mock("@/lib/security/rate-limit.server", async () => (await import("./security-stubs")).rateLimitStub);
vi.mock("@/lib/security/events.server", async () => (await import("./security-stubs")).eventsStub);
const verifySessionCookie = vi.fn();
vi.mock("@/lib/firebase/admin", () => ({ isAdminConfigured: () => true, adminAuth: () => ({ verifySessionCookie }) }));
const deleteAccount = vi.fn();
vi.mock("@/lib/account/delete.server", () => ({ deleteAccount, deleteAllLocationData: vi.fn() }));
const getAdminStats = vi.fn();
vi.mock("@/lib/admin/stats.server", () => ({ getAdminStats }));

const now = () => Math.floor(Date.now() / 1000);
const decoded = (over = {}) => ({ uid: "u1", email: "a@x.co", email_verified: true, auth_time: now(), firebase: { sign_in_provider: "password" }, ...over });
const req = (method: string, body?: unknown) =>
  new NextRequest("http://fg.test/api/x", {
    method,
    headers: { origin: "http://fg.test", host: "fg.test", cookie: "__session=c" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
const ctx = { params: Promise.resolve({}) };

beforeEach(() => {
  vi.clearAllMocks();
  securityEvents.length = 0;
  verifySessionCookie.mockResolvedValue(decoded());
});

describe("DELETE /api/account", async () => {
  const { DELETE } = await import("@/app/api/account/route");

  it("requires typing DELETE", async () => {
    expect((await DELETE(req("DELETE", { confirm: "delete" }), ctx)).status).toBe(400);
    expect((await DELETE(req("DELETE", {}), ctx)).status).toBe(400);
    expect(deleteAccount).not.toHaveBeenCalled();
  });

  it("requires a sign-in within the last 5 minutes", async () => {
    verifySessionCookie.mockResolvedValue(decoded({ auth_time: now() - 6 * 60 }));
    const res = await DELETE(req("DELETE", { confirm: "DELETE" }), ctx);
    expect(res.status).toBe(401);
    expect((await res.json()).error.code).toBe("reauth_required");
    expect(deleteAccount).not.toHaveBeenCalled();
  });

  it("deletes with a fresh sign-in and confirmation", async () => {
    const res = await DELETE(req("DELETE", { confirm: "DELETE" }), ctx);
    expect(res.status).toBe(200);
    expect(deleteAccount).toHaveBeenCalledWith(expect.objectContaining({ uid: "u1" }), expect.anything());
  });
});

describe("GET /api/admin/stats", async () => {
  const { GET } = await import("@/app/api/admin/stats/route");

  it("403s ordinary users and logs the attempt", async () => {
    const res = await GET(req("GET"), ctx);
    expect(res.status).toBe(403);
    expect(getAdminStats).not.toHaveBeenCalled();
    expect(securityEvents.map((e) => e.type)).toContain("admin_denied");
  });

  it("ignores admin-looking fields that aren't the custom claim", async () => {
    verifySessionCookie.mockResolvedValue(decoded({ role: "admin", isAdmin: true, admin: "true" }));
    expect((await GET(req("GET"), ctx)).status).toBe(403);
  });

  it("serves aggregates to holders of the admin claim", async () => {
    verifySessionCookie.mockResolvedValue(decoded({ admin: true }));
    getAdminStats.mockResolvedValue({ users: { total: 3 } });
    const res = await GET(req("GET"), ctx);
    expect(res.status).toBe(200);
    expect((await res.json()).users.total).toBe(3);
  });
});
