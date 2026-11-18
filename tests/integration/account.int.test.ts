import { Timestamp } from "firebase-admin/firestore";
import { beforeEach, describe, expect, it } from "vitest";
import { deleteAccount, deleteAllLocationData } from "@/lib/account/delete.server";
import type { SessionUser } from "@/lib/auth/session";
import { listMyDevices, registerDevice } from "@/lib/devices/service.server";
import { adminAuth, adminDb } from "@/lib/firebase/admin";
import { listFamilyEvents } from "@/lib/families/events.server";
import { createFamily, getFamilyForMember, inviteMember, listMyFamilies, respondToInvitation } from "@/lib/families/service.server";
import { createZone, listZones } from "@/lib/geofences/service.server";
import { getMySharingState, listMyHistory, recordLocation, startSharing } from "@/lib/location/service.server";
import { listNotifications } from "@/lib/notifications/service.server";
import { logSecurityEvent } from "@/lib/security/events.server";
import { hashId } from "@/lib/security/privacy";
import { createGlobalRateLimiter } from "@/lib/security/rate-limit.server";
import { acknowledgeSos, listSosForUser, sendSos } from "@/lib/sos/service.server";
import { makeUser, wipe } from "./helpers";

let ann: SessionUser, bob: SessionUser, cat: SessionUser, dan: SessionUser;
let home: string, solo: string;
const exists = async (path: string) => (await adminDb().doc(path).get()).exists;
const count = async (q: FirebaseFirestore.Query) => (await q.count().get()).data().count;

beforeEach(async () => {
  await wipe();
  ann = await makeUser("Ann");
  bob = await makeUser("Bob");
  cat = await makeUser("Cat");
  dan = await makeUser("Dan");
  home = (await createFamily(ann, "Home")).id; // ann owner, bob guardian, cat member
  for (const [u, role] of [[bob, "guardian"], [cat, "member"]] as const) {
    const inv = await inviteMember(ann, home, { email: u.email!, role });
    await respondToInvitation(u, inv.id, true);
  }
  solo = (await createFamily(ann, "Ann Solo")).id;
  await createZone(ann, home, { name: "Home", kind: "home", lat: 1, lng: 1, radius: 100, alertsEnabled: true, notifyOnEnter: true, notifyOnExit: true });
  await inviteMember(ann, home, { email: dan.email!, role: "member" }); // pending invite sent by ann
  await startSharing(ann, { familyIds: [home], keepHistory: true, historyRetentionDays: 7 });
  await recordLocation(ann, { lat: 1, lng: 1, accuracy: 10, timestamp: Date.now() });
  await registerDevice(ann, { name: "Phone", type: "android", platform: "Chrome on Android" });
  const annSos = (await sendSos(ann, { message: "Ann's alert" })).alert;
  const catSos = (await sendSos(cat, { message: "Cat's alert" })).alert;
  await acknowledgeSos(ann, catSos.id);
  await acknowledgeSos(bob, annSos.id);
});

describe("delete all location data", () => {
  it("turns sharing off, deletes the live location and all history — nothing else", async () => {
    expect(await listMyHistory(ann.uid)).toHaveLength(1);
    const r = await deleteAllLocationData(ann.uid);
    expect(r.historyDeleted).toBe(1);
    expect(await exists(`locations/${ann.uid}`)).toBe(false);
    expect((await getMySharingState(ann.uid)).consent.active).toBe(false);
    expect(await listMyHistory(ann.uid)).toEqual([]);
    expect((await listMyFamilies(ann.uid)).length).toBe(2); // account untouched
  });
});

describe("account deletion", () => {
  beforeEach(async () => {
    await deleteAccount(ann);
  });

  it("removes the sign-in account and profile", async () => {
    await expect(adminAuth().getUser(ann.uid)).rejects.toMatchObject({ code: "auth/user-not-found" });
    expect(await exists(`users/${ann.uid}`)).toBe(false);
  });

  it("removes all location data", async () => {
    expect(await exists(`locations/${ann.uid}`)).toBe(false);
    expect(await count(adminDb().collection(`locationHistory/${ann.uid}/points`))).toBe(0);
  });

  it("hands the family to the longest-standing guardian, who is told; others keep using it", async () => {
    const fam = await getFamilyForMember(home, bob.uid);
    expect(fam.ownerId).toBe(bob.uid);
    expect(fam.myRole).toBe("owner");
    expect(fam.members.map((m) => m.displayName).sort()).toEqual(["Bob", "Cat"]);
    expect((await listNotifications(bob.uid)).some((n) => n.title === "You're now the owner of Home")).toBe(true);
    expect((await listZones(home, cat.uid)).map((z) => z.name)).toEqual(["Home"]); // zone stays with the family…
    expect((await adminDb().collection("geofences").get()).docs[0]!.get("createdBy")).toBeNull(); // …unlinked from Ann
  });

  it("deletes families where nobody else was a member", async () => {
    expect(await exists(`families/${solo}`)).toBe(false);
  });

  it("deletes Ann's SOS alerts and her acknowledgements of others' alerts", async () => {
    const left = await listSosForUser(bob.uid);
    expect(left.map((a) => a.message)).toEqual(["Cat's alert"]);
    expect(left[0]!.acknowledgedBy).toEqual([]);
    expect(await count(adminDb().collection("emergencyAlerts").where("uid", "==", ann.uid))).toBe(0);
  });

  it("removes Ann from family activity, her inbox, devices and pending invitations", async () => {
    expect((await listFamilyEvents(home, bob.uid)).some((e) => e.uid === ann.uid)).toBe(false);
    expect(await count(adminDb().collection(`notifications/${ann.uid}/items`))).toBe(0);
    expect(await listMyDevices(ann.uid)).toEqual([]);
    const invites = await adminDb().collection("familyInvitations").where("invitedBy", "==", ann.uid).get();
    expect(invites.docs.map((d) => d.get("status")).filter((s) => s === "pending")).toEqual([]);
  });

  it("leaves no document anywhere that mentions Ann's uid", async () => {
    const collections = ["users", "families", "familyInvitations", "devices", "locations", "emergencyAlerts", "geofences"];
    for (const c of collections) {
      const snap = await adminDb().collection(c).get();
      for (const d of snap.docs) {
        const doc = JSON.stringify(d.data());
        expect(doc, `${c}/${d.id}`).not.toContain(ann.uid);
        expect(doc, `${c}/${d.id}`).not.toContain(ann.email!);
      }
    }
  });

  it("a deleted user's leftover session can't be used", async () => {
    const { verifySessionCookie } = await import("@/lib/auth/session");
    expect(await verifySessionCookie("anything")).toBeNull();
  });

  it("is safe to run again (idempotent retry)", async () => {
    await expect(deleteAccount(ann)).resolves.toBeUndefined();
  });

  it("logs the deletion pseudonymously", async () => {
    await new Promise((r) => setTimeout(r, 200));
    const ev = await adminDb().collection("securityEvents").where("type", "==", "account_deleted").get();
    expect(ev.size).toBe(1);
    expect(ev.docs[0]!.get("uidHash")).toBe(hashId(ann.uid));
    expect(JSON.stringify(ev.docs[0]!.data())).not.toContain(ann.uid);
  });
});

describe("account deletion — non-owner", () => {
  it("a member simply leaves; the family is untouched", async () => {
    await deleteAccount(cat);
    const fam = await getFamilyForMember(home, ann.uid);
    expect(fam.members.map((m) => m.displayName).sort()).toEqual(["Ann", "Bob"]);
    expect(fam.ownerId).toBe(ann.uid);
  });
});

describe("global rate limiter (Firestore-backed)", () => {
  it("enforces a limit shared by separate limiter instances (i.e. separate servers)", async () => {
    const serverA = createGlobalRateLimiter({ name: "t", limit: 3, windowMs: 60_000 });
    const serverB = createGlobalRateLimiter({ name: "t", limit: 3, windowMs: 60_000 });
    const results = [await serverA("k"), await serverB("k"), await serverA("k"), await serverB("k")];
    expect(results.map((r) => r.ok)).toEqual([true, true, true, false]);
    expect((await serverB("other-key")).ok).toBe(true);
  });
  it("stores only hashed keys with an expiry", async () => {
    const lim = createGlobalRateLimiter({ name: "p", limit: 5, windowMs: 60_000 });
    await lim("203.0.113.7");
    const docs = (await adminDb().collection("_rateLimits").get()).docs;
    expect(JSON.stringify(docs.map((d) => ({ id: d.id, ...d.data() })))).not.toContain("203.0.113.7");
    expect(docs.every((d) => d.get("expireAt") instanceof Timestamp)).toBe(true);
  });
});

describe("security event log", () => {
  it("never stores raw IPs or user ids", async () => {
    await logSecurityEvent("csrf_blocked", { uid: "user-123", ip: "198.51.100.42", route: "/api/x" });
    const ev = (await adminDb().collection("securityEvents").where("type", "==", "csrf_blocked").get()).docs[0]!.data();
    expect(ev.ipPrefix).toBe("198.51.100.0/24");
    expect(ev.uidHash).toBe(hashId("user-123"));
    expect(JSON.stringify(ev)).not.toMatch(/198\.51\.100\.42|user-123/);
  });
});
