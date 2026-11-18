import { describe, expect, it } from "vitest";
import { buildCsp } from "@/lib/security/csp";

const parse = (csp: string) => Object.fromEntries(csp.split("; ").map((d) => { const [k, ...v] = d.split(" "); return [k, v]; }));

describe("Content-Security-Policy", () => {
  const prod = parse(buildCsp({ authDomain: "fg.firebaseapp.com" }));
  it("blocks framing, plugins, base-tag and foreign form hijacks", () => {
    expect(prod["frame-ancestors"]).toEqual(["'none'"]);
    expect(prod["object-src"]).toEqual(["'none'"]);
    expect(prod["base-uri"]).toEqual(["'self'"]);
    expect(prod["form-action"]).toEqual(["'self'"]);
    expect(prod["default-src"]).toEqual(["'self'"]);
  });
  it("allows Firebase, Maps and the configured auth domain — no wildcard '*' anywhere", () => {
    expect(prod["connect-src"]).toContain("https://*.googleapis.com");
    expect(prod["script-src"]).toContain("https://maps.googleapis.com");
    expect(prod["frame-src"]).toContain("https://fg.firebaseapp.com");
    for (const v of Object.values(prod)) expect(v).not.toContain("*");
    expect(prod).toHaveProperty("upgrade-insecure-requests");
  });
  it("only allows emulator hosts in emulator mode", () => {
    expect(buildCsp({})).not.toContain("127.0.0.1");
    expect(buildCsp({ emulators: true })).toContain("http://127.0.0.1:9099");
    expect(buildCsp({ emulators: true })).not.toContain("upgrade-insecure-requests");
  });
});
