import { describe, expect, it } from "vitest";
import { cn, initials, timeAgo } from "@/lib/utils";

describe("timeAgo", () => {
  const now = 1_700_000_000_000;
  it.each([
    [10_000, "just now"],
    [5 * 60_000, "5 min ago"],
    [3 * 3600_000, "3 h ago"],
    [2 * 86400_000, "2 d ago"],
  ])("formats %i ms ago as %s", (delta, expected) => {
    expect(timeAgo(now - delta, now)).toBe(expected);
  });
  it("never returns negative values for future timestamps", () => {
    expect(timeAgo(now + 60_000, now)).toBe("just now");
  });
});

describe("initials", () => {
  it("uses first and last name", () => expect(initials("Ananya Rao Sharma")).toBe("AS"));
  it("handles single names", () => expect(initials("meera")).toBe("M"));
  it("handles empty input", () => expect(initials("   ")).toBe("?"));
});

describe("cn", () => {
  it("merges conflicting tailwind classes", () => expect(cn("px-2", "px-4")).toBe("px-4"));
});
