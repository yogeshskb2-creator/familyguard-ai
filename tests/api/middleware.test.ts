import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/env", () => ({ isFirebaseConfigured: () => true }));

describe("middleware route protection", async () => {
  const { middleware } = await import("@/middleware");
  const run = (path: string, cookie?: string) =>
    middleware(new NextRequest(`http://fg.test${path}`, { headers: cookie ? { cookie } : {} }));

  it.each(["/dashboard", "/map", "/family/abc", "/settings", "/admin"])("redirects signed-out visitors from %s", (p) => {
    const res = run(p);
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe(`http://fg.test/login?next=${encodeURIComponent(p)}`);
  });

  it("lets public pages through", () => {
    for (const p of ["/", "/login", "/register", "/forgot-password", "/verify-email"]) {
      expect(run(p).headers.get("location")).toBeNull();
    }
  });

  it("passes through when a session cookie is present (verified server-side)", () => {
    expect(run("/dashboard", "__session=abc").headers.get("location")).toBeNull();
  });
});
