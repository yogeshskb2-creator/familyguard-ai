import { describe, expect, it } from "vitest";
import { authErrorMessage, AuthFlowError } from "@/lib/auth/errors";
import { isSameOrigin } from "@/lib/auth/origin";
import { safeRedirect, withNext } from "@/lib/auth/safe-redirect";
import { createRateLimiter } from "@/lib/rate-limit";
import { passwordScore } from "@/components/auth/PasswordStrength";

describe("safeRedirect (open-redirect protection)", () => {
  it.each([
    ["/family?tab=invites", "/family?tab=invites"],
    ["/map#me", "/map#me"],
  ])("keeps internal path %s", (input, out) => expect(safeRedirect(input)).toBe(out));
  it.each([
    "https://evil.example/phish",
    "//evil.example",
    "/\\evil.example",
    "javascript:alert(1)",
    "dashboard",
    "/api/auth/session",
    "/login",
    "/\u0000x",
    "",
    null,
    undefined,
  ])("falls back for %s", (input) => expect(safeRedirect(input as string)).toBe("/dashboard"));
});

describe("authErrorMessage", () => {
  it("does not reveal whether an account exists", () => {
    const a = authErrorMessage({ code: "auth/user-not-found" });
    const b = authErrorMessage({ code: "auth/wrong-password" });
    const c = authErrorMessage({ code: "auth/invalid-credential" });
    expect(a).toBe(b);
    expect(b).toBe(c);
  });
  it("passes through our own flow errors and hides unknown internals", () => {
    expect(authErrorMessage(new AuthFlowError("Verify your email", "email_not_verified"))).toBe("Verify your email");
    expect(authErrorMessage(new Error("stack trace with secrets"))).toBe("Something went wrong. Please try again.");
  });
});

describe("isSameOrigin (CSRF)", () => {
  const h = (o: Record<string, string>) => new Headers(o);
  it("accepts matching origin", () => expect(isSameOrigin(h({ origin: "https://fg.app", host: "fg.app" }))).toBe(true));
  it("rejects cross-site or missing origin", () => {
    expect(isSameOrigin(h({ origin: "https://evil.example", host: "fg.app" }))).toBe(false);
    expect(isSameOrigin(h({ host: "fg.app" }))).toBe(false);
    expect(isSameOrigin(h({ origin: "null", host: "fg.app" }))).toBe(false);
  });
});

describe("rate limiter", () => {
  it("blocks after the limit and resets after the window", () => {
    const check = createRateLimiter({ limit: 2, windowMs: 1000 });
    expect(check("ip", 0).ok).toBe(true);
    expect(check("ip", 1).ok).toBe(true);
    const blocked = check("ip", 2);
    expect(blocked.ok).toBe(false);
    expect(blocked.retryAfterSec).toBe(1);
    expect(check("other-ip", 3).ok).toBe(true);
    expect(check("ip", 1001).ok).toBe(true);
  });
});

describe("passwordScore", () => {
  it("increases with length and variety", () => {
    expect(passwordScore("abc")).toBe(0);
    expect(passwordScore("abcdefgh")).toBe(1);
    expect(passwordScore("Abcdefgh1234!")).toBe(4);
  });
});

describe("withNext (keeps the destination through sign-up and verification)", () => {
  it("adds a safe next and leaves the default out", () => {
    expect(withNext("/register", "/join/abc")).toBe("/register?next=%2Fjoin%2Fabc");
    expect(withNext("/login", "/join/abc", "verified=1")).toBe("/login?verified=1&next=%2Fjoin%2Fabc");
    expect(withNext("/login", "/dashboard")).toBe("/login");
    expect(withNext("/login", undefined, "verified=1")).toBe("/login?verified=1");
    expect(withNext("/login", "https://evil.example")).toBe("/login");
  });
});
