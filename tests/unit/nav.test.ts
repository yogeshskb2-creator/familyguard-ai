import { describe, expect, it } from "vitest";
import { ALL_NAV_ITEMS, MOBILE_NAV_ITEMS, isActive } from "@/components/layout/nav";

describe("navigation", () => {
  it("has unique routes", () => {
    const hrefs = ALL_NAV_ITEMS.map((i) => i.href);
    expect(new Set(hrefs).size).toBe(hrefs.length);
  });
  it("fits exactly five items in the mobile bar, including SOS", () => {
    expect(MOBILE_NAV_ITEMS).toHaveLength(5);
    expect(MOBILE_NAV_ITEMS.map((i) => i.href)).toContain("/sos");
  });
  it("does not expose the admin console in member navigation", () => {
    expect(ALL_NAV_ITEMS.some((i) => i.href.startsWith("/admin"))).toBe(false);
  });
  it("matches nested routes but not prefixes of other words", () => {
    expect(isActive("/family/abc", "/family")).toBe(true);
    expect(isActive("/familyx", "/family")).toBe(false);
  });
});
