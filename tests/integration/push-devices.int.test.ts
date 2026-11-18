import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { SessionUser } from "@/lib/auth/session";
import {
  deleteDevice,
  disablePush,
  enablePush,
  heartbeat,
  listMyDevices,
  markLocationFromDevice,
  registerDevice,
  renameDevice,
  revokeDevice,
} from "@/lib/devices/service.server";
import { adminAuth, adminDb } from "@/lib/firebase/admin";
import { createFamily, inviteMember, respondToInvitation } from "@/lib/families/service.server";
import { recordLocation, startSharing, stopSharing } from "@/lib/location/service.server";
import { setPushTransport, type PushMessage } from "@/lib/notifications/push.server";
import { listNotifications } from "@/lib/notifications/service.server";
import { sendSos } from "@/lib/sos/service.server";
import { expectError, makeUser, wipe } from "./helpers";

/** Recording transport: what would have gone to FCM. */
const sent: { uid: string; tokens: string[]; msg: PushMessage }[] = [];
setPushTransport({
  async send(uid, tokens, msg) {
    sent.push({ uid, tokens, msg });
    return { invalidTokens: tokens.filter((t) => t.startsWith("expired")) };
  },
});
afterAll(() => setPushTransport(null));

const TOKEN = (n: string) => `fcm-token-${n}-${"x".repeat(30)}`;
let ann: SessionUser, bob: SessionUser, cat: SessionUser;
let home: string;

async function phone(u: SessionUser, name = "Phone", token?: string) {
  const d = await registerDevice(u, { name, type: "android", platform: "Chrome on Android" });
  if (token) await enablePush(u.uid, d.id, token);
  return d;
}

beforeEach(async () => {
  await wipe();
  sent.length = 0;
  ann = await makeUser("Ann");
  bob = await makeUser("Bob");
  cat = await makeUser("Cat");
  home = (await createFamily(ann, "Home")).id;
  for (const u of [bob, cat]) {
    const inv = await inviteMember(ann, home, { email: u.email!, role: "member" });
    await respondToInvitation(u, inv.id, true);
  }
  sent.length = 0;
});

describe("device registry", () => {
  it("registers, lists, renames and heartbeats only the owner's devices", async () => {
    const d = await phone(ann, "Ann's Pixel");
    expect(d).toMatchObject({ name: "Ann's Pixel", type: "android", status: "active", pushEnabled: false, online: true, sendingLocation: false });
    expect((await listMyDevices(ann.uid)).map((x) => x.id)).toEqual([d.id]);
    expect(await listMyDevices(bob.uid)).toEqual([]);
    await renameDevice(ann.uid, d.id, "Work phone");
    expect((await heartbeat(ann.uid, d.id)).name).toBe("Work phone");
  });

  it("other users can't see, rename, heartbeat, revoke or delete your device (404, no existence leak)", async () => {
    const d = await phone(ann);
    await expectError(renameDevice(bob.uid, d.id, "Mine now"), 404);
    await expectError(heartbeat(bob.uid, d.id), 404);
    await expectError(revokeDevice(bob.uid, d.id), 404);
    await expectError(deleteDevice(bob.uid, d.id), 404);
    await expectError(enablePush(bob.uid, d.id, TOKEN("bob")), 404);
  });

  it("never returns the push token", async () => {
    const d = await phone(ann, "P", TOKEN("ann"));
    expect(JSON.stringify(await listMyDevices(ann.uid))).not.toContain(TOKEN("ann"));
    expect(JSON.stringify(d)).not.toContain("fcm-token");
  });

  it("new devices trigger a security notification", async () => {
    await phone(ann, "Old phone", TOKEN("old"));
    sent.length = 0;
    await phone(ann, "New laptop");
    const [n] = await listNotifications(ann.uid);
    expect(n).toMatchObject({ kind: "device", title: "New device added: New laptop" });
    expect(sent.map((s) => s.msg.title)).toEqual(["New device added: New laptop"]); // pushed to the OLD phone
    expect(sent[0]!.tokens).toEqual([TOKEN("old")]);
  });

  it("revoking stops pushes and deletes the token; heartbeat then says 410", async () => {
    const d = await phone(ann, "Lost phone", TOKEN("lost"));
    await revokeDevice(ann.uid, d.id);
    const raw = (await adminDb().doc(`devices/${d.id}`).get()).data()!;
    expect(raw.pushToken).toBeUndefined();
    expect(raw.pushEnabled).toBe(false);
    await expectError(heartbeat(ann.uid, d.id), 410, "revoked");
    await expectError(enablePush(ann.uid, d.id, TOKEN("again")), 410);
    sent.length = 0;
    await sendSos(cat, {});
    expect(sent.filter((s) => s.uid === ann.uid)).toEqual([]);
  });

  it("caps active devices per user", async () => {
    for (let i = 0; i < 10; i++) await phone(bob, `D${i}`);
    await expectError(phone(bob, "D10"), 409, "device_limit");
  });

  it("marks which device is sending location (own devices only)", async () => {
    const d = await phone(bob);
    await startSharing(bob, { familyIds: [home], keepHistory: false, historyRetentionDays: 7 });
    await recordLocation(bob, { lat: 1, lng: 1, accuracy: 10, timestamp: Date.now() });
    await markLocationFromDevice(bob.uid, d.id);
    expect((await listMyDevices(bob.uid))[0]!.sendingLocation).toBe(true);
    const annDev = await phone(ann);
    await markLocationFromDevice(bob.uid, annDev.id); // someone else's id: ignored
    expect((await listMyDevices(ann.uid))[0]!.lastLocationAt).toBeNull();
  });
});

describe("push delivery", () => {
  it("SOS pushes reach recipients' push-enabled devices, marked critical — never the sender", async () => {
    await phone(ann, "A", TOKEN("ann"));
    await phone(bob, "B", TOKEN("bob"));
    await phone(bob, "B2"); // registered but push not enabled
    await phone(cat, "C", TOKEN("cat"));
    await sendSos(cat, { message: "Help" });
    const sos = sent.filter((s) => s.msg.kind === "sos");
    expect(sos.map((s) => s.uid).sort()).toEqual([ann.uid, bob.uid].sort());
    expect(sos.find((s) => s.uid === bob.uid)!.tokens).toEqual([TOKEN("bob")]);
    expect(sos[0]!.msg).toMatchObject({ critical: true, link: expect.stringMatching(/^\/sos\?alert=/) });
  });

  it("respects per-category preferences (in-app inbox still records)", async () => {
    await phone(ann, "A", TOKEN("ann"));
    await adminDb().doc(`users/${ann.uid}`).update({ notificationPrefs: { sos: false, zones: true, invitations: true, sharing: true, devices: true } });
    await sendSos(cat, {});
    expect(sent.filter((s) => s.uid === ann.uid && s.msg.kind === "sos")).toEqual([]);
    expect((await listNotifications(ann.uid)).some((n) => n.kind === "sos")).toBe(true);
  });

  it("expired tokens are cleaned up automatically", async () => {
    const d = await phone(ann, "A", "expired-token-xxxxxxxxxxxxxxxxxxxx");
    await sendSos(cat, {});
    expect((await listMyDevices(ann.uid)).find((x) => x.id === d.id)!.pushEnabled).toBe(false);
  });

  it("a token moves with the browser: re-registering detaches it from the old record", async () => {
    const a = await phone(ann, "Old", TOKEN("same"));
    const b = await phone(ann, "New", TOKEN("same"));
    const list = await listMyDevices(ann.uid);
    expect(list.find((x) => x.id === a.id)!.pushEnabled).toBe(false);
    expect(list.find((x) => x.id === b.id)!.pushEnabled).toBe(true);
    await sendSos(cat, {});
    expect(sent.filter((s) => s.uid === ann.uid && s.msg.kind === "sos")[0]!.tokens).toEqual([TOKEN("same")]); // once, not twice
  });

  it("disabling push stops delivery", async () => {
    const d = await phone(ann, "A", TOKEN("ann"));
    await disablePush(ann.uid, d.id);
    await sendSos(cat, {});
    expect(sent.filter((s) => s.uid === ann.uid)).toEqual([]);
  });
});

describe("new notification sources", () => {
  it("invitation: the invitee is notified only if they own the VERIFIED address; the inviter learns nothing", async () => {
    const dan = await makeUser("Dan");
    await phone(dan, "D", TOKEN("dan"));
    const r1 = await inviteMember(ann, home, { email: dan.email!, role: "member" });
    expect((await listNotifications(dan.uid))[0]).toMatchObject({ kind: "invitation", title: "Ann invited you to Home" });
    expect(sent.some((s) => s.uid === dan.uid && s.msg.kind === "invitation")).toBe(true);

    const squat = await adminAuth().createUser({ email: "squatter@example.com", emailVerified: false });
    const r2 = await inviteMember(ann, home, { email: "squatter@example.com", role: "member" });
    expect(await listNotifications(squat.uid)).toEqual([]);
    const r3 = await inviteMember(ann, home, { email: "nobody@example.com", role: "member" });
    expect(Object.keys(r1).sort()).toEqual(Object.keys(r2).sort());
    expect(Object.keys(r2).sort()).toEqual(Object.keys(r3).sort());
  });

  it("sharing start/stop notifies the chosen family (once per transition), not the sharer", async () => {
    await startSharing(bob, { familyIds: [home], keepHistory: false, historyRetentionDays: 7 });
    expect((await listNotifications(ann.uid))[0]).toMatchObject({ kind: "sharing_started", title: "Bob is now sharing their location" });
    expect((await listNotifications(bob.uid)).filter((n) => n.kind.startsWith("sharing"))).toEqual([]);
    // re-saving settings while already on doesn't re-announce
    await startSharing(bob, { familyIds: [home], keepHistory: true, historyRetentionDays: 7 });
    expect((await listNotifications(ann.uid)).filter((n) => n.kind === "sharing_started")).toHaveLength(1);
    await stopSharing(bob.uid);
    expect((await listNotifications(cat.uid))[0]).toMatchObject({ kind: "sharing_stopped", title: "Bob stopped sharing their location" });
    await stopSharing(bob.uid); // already off: no second notice
    expect((await listNotifications(cat.uid)).filter((n) => n.kind === "sharing_stopped")).toHaveLength(1);
  });
});
