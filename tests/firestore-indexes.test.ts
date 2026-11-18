import { describe, expect, it } from "vitest";
import { isMissingIndexError } from "@/lib/firestore/indexes";

describe("isMissingIndexError", () => {
  it("recognises Firestore's missing-index error (Admin SDK and web SDK shapes)", () => {
    expect(isMissingIndexError(Object.assign(new Error("9 FAILED_PRECONDITION: The query requires an index. You can create it here: https://…"), { code: 9 }))).toBe(true);
    expect(isMissingIndexError({ code: "failed-precondition", message: "The query requires an index." })).toBe(true);
  });
  it("does not swallow other errors", () => {
    expect(isMissingIndexError(Object.assign(new Error("9 FAILED_PRECONDITION: transaction aborted"), { code: 9 }))).toBe(false);
    expect(isMissingIndexError(Object.assign(new Error("7 PERMISSION_DENIED"), { code: 7 }))).toBe(false);
    expect(isMissingIndexError(null)).toBe(false);
    expect(isMissingIndexError("index")).toBe(false);
  });
});
