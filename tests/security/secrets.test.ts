/** Audit sweep: no credentials in the source tree, and server secrets never reach client code. */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const SKIP = new Set(["node_modules", ".git", ".next", ".next-e2e", ".firebase", "coverage", "out", "test-results"]);
function files(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    if (SKIP.has(n) || (n.startsWith(".env") && n !== ".env.example")) return [];
    const p = join(dir, n);
    const st = statSync(p);
    if (st.isDirectory()) return files(p);
    return /\.(ts|tsx|js|mjs|cjs|json|md|rules|yml|yaml|sh|example|txt|html)$/.test(n) && st.size < 2_000_000 ? [p] : [];
  });
}
const ALL = files(".").filter((f) => f !== "package-lock.json");

const PATTERNS: [string, RegExp][] = [
  ["private key block", /-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----/],
  ["service-account JSON", /"private_key"\s*:\s*"-----BEGIN/],
  ["Google API key", /AIza[0-9A-Za-z_-]{35}/],
  ["Anthropic key", /sk-ant-(?:api|admin)\d{2}-[A-Za-z0-9_-]{20,}/],
  ["OpenAI key", /sk-(?:proj-)?[A-Za-z0-9]{40,}/],
  ["GitHub token", /gh[pousr]_[A-Za-z0-9]{36,}/],
  ["Slack token", /xox[baprs]-[A-Za-z0-9-]{10,}/],
];

describe("secret scan", () => {
  it("scans a meaningful number of files", () => expect(ALL.length).toBeGreaterThan(100));
  for (const [name, re] of PATTERNS) {
    it(`no ${name} in the repository`, () => {
      const hits = ALL.filter((f) => re.test(readFileSync(f, "utf8")));
      expect(hits).toEqual([]);
    });
  }

  it("the patterns really detect planted credentials (control)", () => {
    const planted = ["AI" + "za" + "x".repeat(35), "sk-ant-" + "api03-" + "a".repeat(30), "gh" + "p_" + "b".repeat(36), "-----BEGIN " + "PRIVATE KEY-----"];
    for (const p of planted) expect(PATTERNS.some(([, re]) => re.test(p)), p).toBe(true);
  });

  it(".gitignore keeps env files and service-account keys out of git", () => {
    const gi = readFileSync(".gitignore", "utf8");
    for (const p of [".env", ".env.local", "service-account*.json"]) expect(gi).toContain(p);
  });

  it(".env.example contains placeholders only", () => {
    expect(existsSync(".env.example")).toBe(true);
    for (const line of readFileSync(".env.example", "utf8").split("\n")) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (!m) continue;
      expect(m[2]!.length, `${m[1]} should be empty or a short placeholder`).toBeLessThan(40);
    }
  });

  it("server-only secrets are never NEXT_PUBLIC_ and never read in client components", () => {
    const SERVER = ["ANTHROPIC_API_KEY", "OPENAI_API_KEY", "GEMINI_API_KEY", "FIREBASE_ADMIN_PRIVATE_KEY", "FIREBASE_ADMIN_CLIENT_EMAIL", "FIREBASE_SERVICE_ACCOUNT", "SECURITY_LOG_SALT"];
    const src = ALL.filter((f) => f.startsWith("src"));
    for (const f of src) {
      const text = readFileSync(f, "utf8");
      for (const s of SERVER) expect(text, f).not.toContain(`NEXT_PUBLIC_${s}`);
      if (/^\s*["']use client["']/.test(text)) {
        for (const s of SERVER) expect(text, `${f} reads ${s}`).not.toContain(s);
      }
    }
  });

  it("modules holding secrets are marked server-only", () => {
    for (const f of ["src/lib/firebase/admin.ts", "src/lib/ai/providers.server.ts"]) {
      expect(readFileSync(f, "utf8"), f).toMatch(/import "server-only"/);
    }
  });
});
