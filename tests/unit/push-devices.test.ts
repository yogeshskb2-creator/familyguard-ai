import { readFileSync } from "node:fs";
import vm from "node:vm";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/firebase/admin", () => ({ adminDb: vi.fn(), adminMessaging: vi.fn(), isAdminConfigured: () => false }));

import { describeThisDevice } from "@/lib/devices/client";
import { pushTokenSchema, registerDeviceSchema } from "@/lib/devices/validation";
import { PushOutbox } from "@/lib/notifications/push.server";
import { categoryOf, DEFAULT_PREFS, prefsFromDoc, prefsSchema } from "@/lib/notifications/prefs";

const UA = {
  pixel: "Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Mobile Safari/537.36",
  androidTab: "Mozilla/5.0 (Linux; Android 15; SM-X710) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36",
  iphone: "Mozilla/5.0 (iPhone; CPU iPhone OS 19_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/19.0 Mobile/15E148 Safari/604.1",
  ipad: "Mozilla/5.0 (iPad; CPU OS 19_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/19.0 Mobile/15E148 Safari/604.1",
  edge: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36 Edg/140.0",
  firefoxMac: "Mozilla/5.0 (Macintosh; Intel Mac OS X 15.0; rv:140.0) Gecko/20100101 Firefox/140.0",
};

describe("describeThisDevice", () => {
  it.each([
    ["pixel", "android", "Chrome on Android", "My Android phone"],
    ["androidTab", "tablet", "Chrome on Android", "My Android tablet"],
    ["iphone", "ios", "Safari on iOS", "My iOS phone"],
    ["ipad", "tablet", "Safari on iPadOS", "My iPadOS tablet"],
    ["edge", "web", "Edge on Windows", "My Windows computer"],
    ["firefoxMac", "web", "Firefox on macOS", "My macOS computer"],
  ] as const)("%s → %s / %s", (key, type, platform, name) => {
    expect(describeThisDevice(UA[key])).toEqual({ type, platform, defaultName: name });
  });
  it("never keeps the full user-agent string", () => {
    expect(JSON.stringify(describeThisDevice(UA.pixel))).not.toContain("Pixel 9");
  });
});

describe("device & push validation", () => {
  it("rejects full user-agent strings, markup and unknown fields", () => {
    expect(registerDeviceSchema.safeParse({ name: "Phone", type: "android", platform: UA.pixel }).success).toBe(false);
    expect(registerDeviceSchema.safeParse({ name: "<b>x</b>", type: "android", platform: "Chrome on Android" }).success).toBe(false);
    expect(registerDeviceSchema.safeParse({ name: "Phone", type: "android", platform: "Chrome on Android", ownerId: "victim" }).success).toBe(false);
    expect(registerDeviceSchema.safeParse({ name: "Phone", type: "fridge", platform: "x" }).success).toBe(false);
  });
  it("accepts FCM-shaped tokens only", () => {
    expect(pushTokenSchema.safeParse({ token: "dGVzdDpBUEE5MWJIX" + "a".repeat(140) }).success).toBe(true);
    expect(pushTokenSchema.safeParse({ token: "short" }).success).toBe(false);
    expect(pushTokenSchema.safeParse({ token: "<script>alert(1)</script>".repeat(3) }).success).toBe(false);
  });
});

describe("notification preferences", () => {
  it("maps every notification kind to a category", () => {
    expect(categoryOf("sos")).toBe("sos");
    expect(categoryOf("geofence_exit")).toBe("zones");
    expect(categoryOf("invitation")).toBe("invitations");
    expect(categoryOf("sharing_stopped")).toBe("sharing");
    expect(categoryOf("device")).toBe("devices");
  });
  it("defaults everything on and ignores junk", () => {
    expect(prefsFromDoc(undefined)).toEqual(DEFAULT_PREFS);
    expect(prefsFromDoc({ sos: false, zones: "nope", extra: true })).toEqual({ ...DEFAULT_PREFS, sos: false, zones: false });
    expect(prefsSchema.safeParse({ ...DEFAULT_PREFS, extra: true }).success).toBe(false);
    expect(prefsSchema.safeParse({ sos: true }).success).toBe(false);
  });
});

describe("PushOutbox", () => {
  it("reset() discards jobs from a failed/retried transaction attempt (no duplicate pushes)", () => {
    const o = new PushOutbox();
    const n = { kind: "sos" as const, title: "SOS", body: "", link: "/sos" };
    o.add("a", n); // attempt 1 (aborted by contention)
    o.reset(); // attempt 2 starts
    o.add("a", n);
    expect(o.size).toBe(1);
  });
  it("flush() with no transport configured is a silent no-op", async () => {
    const o = new PushOutbox();
    o.add("a", { kind: "sos", title: "x", body: "", link: null });
    await expect(o.flush()).resolves.toBeUndefined();
    expect(o.size).toBe(0);
  });
});

describe("push service worker", () => {
  function loadSW() {
    const handlers: Record<string, (e: unknown) => void> = {};
    const shown: { title: string; opts: { data: { link: string }; requireInteraction?: boolean } }[] = [];
    const opened: string[] = [];
    const self = {
      location: { origin: "https://app.familyguard.test" },
      addEventListener: (type: string, fn: (e: unknown) => void) => (handlers[type] = fn),
      registration: { showNotification: (title: string, opts: never) => (shown.push({ title, opts }), Promise.resolve()) },
      clients: { matchAll: async () => [], openWindow: async (u: string) => opened.push(u), claim: async () => {} },
      skipWaiting: () => {},
    };
    vm.runInNewContext(readFileSync("public/firebase-messaging-sw.js", "utf8"), { self, URL });
    const fire = async (type: string, event: Record<string, unknown>) => {
      let p: Promise<unknown> = Promise.resolve();
      handlers[type]!({ ...event, waitUntil: (x: Promise<unknown>) => (p = x) });
      await p;
    };
    return { fire, shown, opened };
  }
  const push = (payload: unknown) => ({ data: { json: () => payload } });

  it("shows FCM notifications; SOS stays on screen until handled", async () => {
    const sw = loadSW();
    await sw.fire("push", push({ notification: { title: "🚨 SOS from Meera", body: "Help" }, data: { kind: "sos", link: "/sos?alert=a1" } }));
    expect(sw.shown[0]).toMatchObject({ title: "🚨 SOS from Meera", opts: { requireInteraction: true, data: { link: "https://app.familyguard.test/sos?alert=a1" } } });
  });
  it("never opens an external URL from a payload (phishing-proof)", async () => {
    const sw = loadSW();
    await sw.fire("push", push({ notification: { title: "x" }, data: { link: "https://evil.example/login" } }));
    expect(sw.shown[0]!.opts.data.link).toBe("https://app.familyguard.test/notifications");
    await sw.fire("notificationclick", { notification: { close: () => {}, data: { link: "javascript:alert(1)" } } });
    expect(sw.opened).toEqual(["https://app.familyguard.test/notifications"]);
  });
  it("tolerates empty or malformed payloads", async () => {
    const sw = loadSW();
    await sw.fire("push", { data: { json: () => { throw new Error("bad"); } } });
    expect(sw.shown[0]!.title).toBe("FamilyGuard AI");
  });
});
