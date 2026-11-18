/**
 * Audit sweep: every API route handler must go through `authed()` (session
 * verification + same-origin check + verified email + rate limit + error
 * mapping). The only exceptions are listed explicitly, with their reasons,
 * and are checked for the equivalent controls.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

function routes(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? routes(p) : n === "route.ts" ? [p] : [];
  });
}
const ALL = routes("src/app/api").map((p) => relative("src/app/api", p).replaceAll("\\", "/"));
const METHOD = /export\s+(?:async\s+function|const)\s+(GET|POST|PUT|PATCH|DELETE)\b([^\n]*)/g;

const EXCEPTIONS: Record<string, string> = {
  // Creates the session itself, so it can't require one. Checks origin, rate-limits per IP, verifies the ID token.
  "auth/session/route.ts": "session bootstrap",
  // Must work before the email is verified (the verify screen reads the profile). Verifies session + origin itself.
  "profile/route.ts": "pre-verification profile",
};

describe("API route authentication sweep", () => {
  it("finds the API routes", () => expect(ALL.length).toBeGreaterThan(20));

  for (const file of ALL) {
    it(`${file}: every handler is protected`, () => {
      const src = readFileSync(join("src/app/api", file), "utf8");
      const handlers = [...src.matchAll(METHOD)];
      expect(handlers.length, "exports at least one HTTP handler").toBeGreaterThan(0);
      if (EXCEPTIONS[file]) {
        expect(src).toMatch(/isSameOrigin\(/);
        if (file !== "auth/session/route.ts") expect(src).toMatch(/verifySessionCookie\(/);
        return;
      }
      for (const [, method, rest] of handlers) {
        expect(rest, `${method} must be "= authed(...)"`).toMatch(/^\s*=\s*authed\s*(<[^>]*>)?\(/);
      }
    });
  }

  it("admin routes check the custom claim, not a profile field", () => {
    for (const file of ALL.filter((f) => f.startsWith("admin/"))) {
      const src = readFileSync(join("src/app/api", file), "utf8");
      expect(src).toMatch(/user\.isAdmin/);
      expect(src).not.toMatch(/getUserProfile|users\//);
    }
  });
});
