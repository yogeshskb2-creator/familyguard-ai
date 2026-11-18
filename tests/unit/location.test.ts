import { describe, expect, it } from "vitest";
import { distanceMeters, formatAccuracy, presence, shouldRecordHistory, shouldSend, ONLINE_WINDOW_MS } from "@/lib/location/geo";
import { isFreshFix, locationUpdateSchema, startSharingSchema, updateSharingSchema } from "@/lib/location/validation";
import { consentFromDoc, NO_CONSENT } from "@/lib/location/consent";

const BLR = { lat: 12.9716, lng: 77.5946 };

describe("distanceMeters", () => {
  it("is ~0 for the same point and ~111 km per degree of latitude", () => {
    expect(distanceMeters(BLR, BLR)).toBe(0);
    expect(distanceMeters({ lat: 0, lng: 0 }, { lat: 1, lng: 0 })).toBeCloseTo(111_195, -2);
  });
});

describe("shouldSend (battery & data throttle)", () => {
  const last = { ...BLR, accuracy: 10, at: 0 };
  it("always sends the first fix", () => expect(shouldSend(null, { ...last })).toBe(true));
  it("never sends more often than every 15 s", () => {
    expect(shouldSend(last, { lat: 13.5, lng: 78, accuracy: 10, at: 10_000 })).toBe(false);
  });
  it("sends when moved meaningfully", () => {
    expect(shouldSend(last, { lat: 12.9726, lng: 77.5946, accuracy: 10, at: 20_000 })).toBe(true); // ~110 m
  });
  it("doesn't send GPS jitter while stationary…", () => {
    expect(shouldSend(last, { lat: 12.97161, lng: 77.59461, accuracy: 10, at: 20_000 })).toBe(false);
  });
  it("…but sends a heartbeat every minute", () => {
    expect(shouldSend(last, { lat: 12.97161, lng: 77.59461, accuracy: 10, at: 61_000 })).toBe(true);
  });
  it("ignores very inaccurate fixes when a good one was sent", () => {
    expect(shouldSend(last, { lat: 13, lng: 78, accuracy: 5000, at: 120_000 })).toBe(false);
  });
});

describe("presence", () => {
  it("is online within the window and offline after", () => {
    expect(presence(1000, 1000 + ONLINE_WINDOW_MS)).toBe("online");
    expect(presence(1000, 1001 + ONLINE_WINDOW_MS)).toBe("offline");
  });
});

describe("history thresholds", () => {
  it("records the first point, significant moves, and every 5 minutes", () => {
    const p = { ...BLR, at: 0 };
    expect(shouldRecordHistory(null, { ...BLR, accuracy: 5, at: 0 })).toBe(true);
    expect(shouldRecordHistory(p, { ...BLR, accuracy: 5, at: 60_000 })).toBe(false);
    expect(shouldRecordHistory(p, { lat: 12.9726, lng: 77.5946, accuracy: 5, at: 60_000 })).toBe(true);
    expect(shouldRecordHistory(p, { ...BLR, accuracy: 5, at: 5 * 60_000 })).toBe(true);
  });
});

describe("location validation", () => {
  const ok = { lat: 12.97, lng: 77.59, accuracy: 15, timestamp: Date.now() };
  it("accepts a normal fix", () => expect(locationUpdateSchema.safeParse(ok).success).toBe(true));
  it.each([
    { lat: 91 },
    { lng: -181 },
    { accuracy: 0 },
    { accuracy: Number.NaN },
    { heading: 360 },
    { speed: 500 },
    { uid: "someone-else" },
    { sharedWith: ["fam1"] },
  ])("rejects %o", (bad) => expect(locationUpdateSchema.safeParse({ ...ok, ...bad }).success).toBe(false));

  it("rejects stale or future fixes", () => {
    const now = 1_000_000_000;
    expect(isFreshFix(now - 60_000, now)).toBe(true);
    expect(isFreshFix(now - 3 * 60_000, now)).toBe(false);
    expect(isFreshFix(now + 60_000, now)).toBe(false);
  });

  it("requires at least one family and a valid retention", () => {
    expect(startSharingSchema.safeParse({ familyIds: [], keepHistory: false, historyRetentionDays: 7 }).success).toBe(false);
    expect(startSharingSchema.safeParse({ familyIds: ["Abcdef123456"], keepHistory: true, historyRetentionDays: 365 }).success).toBe(false);
    expect(startSharingSchema.safeParse({ familyIds: ["Abcdef123456"], keepHistory: true, historyRetentionDays: 30 }).success).toBe(true);
    expect(updateSharingSchema.safeParse({}).success).toBe(false);
    expect(updateSharingSchema.safeParse({ active: true }).success).toBe(false);
  });
});

describe("consent defaults", () => {
  it("treats a missing/garbled consent record as NOT sharing", () => {
    expect(consentFromDoc(undefined)).toEqual(NO_CONSENT);
    expect(consentFromDoc({ active: "yes" }).active).toBe(false);
    expect(consentFromDoc({ active: true, familyIds: ["f"], grantedAt: { toMillis: () => 5 } })).toMatchObject({ active: true, grantedAt: 5 });
  });
  it("formats accuracy for people", () => {
    expect(formatAccuracy(12.4)).toBe("±12 m");
    expect(formatAccuracy(2500)).toBe("±2.5 km");
  });
});
