import { beforeEach, describe, expect, it } from "vitest";
import type { SessionUser } from "@/lib/auth/session";
import { adminDb } from "@/lib/firebase/admin";
import { listFamilyEvents } from "@/lib/families/events.server";
import { createFamily, inviteMember, removeMember, respondToInvitation } from "@/lib/families/service.server";
import { acknowledgeZoneAlarm, createZone, deleteZone, listMyZoneAlarms, listZones, updateZone } from "@/lib/geofences/service.server";
import { recordLocation, startSharing, stopSharing } from "@/lib/location/service.server";
import { listNotifications, markRead, unreadCount } from "@/lib/notifications/service.server";
import {
  acknowledgeSos,
  getEmergencySettings,
  getSosForUser,
  listSosForUser,
  resolveSos,
  saveEmergencySettings,
  sendSos,
} from "@/lib/sos/service.server";
import { expectError, makeUser, wipe } from "./helpers";

let ann: SessionUser, bob: SessionUser, cat: SessionUser, eve: SessionUser;
let home: string, work: string;

async function join(owner: SessionUser, familyId: string, who: SessionUser, role: "member" | "guardian" = "member") {
  const inv = await inviteMember(owner, familyId, { email: who.email!, role });
  await respondToInvitation(who, inv.id, true);
}
const fix = (lat: number, lng: number, accuracy = 10) => ({ lat, lng, accuracy, timestamp: Date.now() });

// Home zone: 150 m around (12.9716, 77.5946). ~0.001° lat ≈ 111 m.
const HOME = { lat: 12.9716, lng: 77.5946 };
const AT_HOME = fix(12.9717, 77.5947);
const FAR = fix(12.99, 77.62);
const EDGE = fix(12.9716 + 0.0015, 77.5946); // ~167 m — inside the exit buffer, outside the radius

beforeEach(async () => {
  await wipe();
  ann = await makeUser("Ann");
  bob = await makeUser("Bob");
  cat = await makeUser("Cat");
  eve = await makeUser("Eve");
  home = (await createFamily(ann, "Home")).id; // ann (owner), bob (guardian), cat
  work = (await createFamily(eve, "Work")).id; // eve, cat
  await join(ann, home, bob, "guardian");
  await join(ann, home, cat);
  await join(eve, work, cat);
  // Start each test with empty inboxes (setup creates invitation notifications).
  for (const u of [ann, bob, cat, eve]) await clearInbox(u.uid);
});

async function clearInbox(uid: string) {
  const items = await adminDb().collection(`notifications/${uid}/items`).get();
  await Promise.all(items.docs.map((d) => d.ref.delete()));
}
/** Notifications of the given kinds only (sharing on/off notices are tested separately). */
const of = async (uid: string, ...kinds: string[]) => (await listNotifications(uid)).filter((n) => kinds.includes(n.kind));
const zoneAlerts = async (uid: string) => (await of(uid, "geofence_enter", "geofence_exit")).length;

describe("SOS", () => {
  it("alerts every other member of the sender's families, with an optional one-time location", async () => {
    const { alert, duplicate } = await sendSos(cat, { location: { lat: 12.9, lng: 77.5, accuracy: 20 }, message: "Car broke down" });
    expect(duplicate).toBe(false);
    expect(alert.status).toBe("active");
    expect(alert.familyIds.sort()).toEqual([home, work].sort());
    expect(alert.recipientCount).toBe(3); // ann, bob, eve
    for (const u of [ann, bob, eve]) {
      const [n] = await of(u.uid, "sos");
      expect(n).toMatchObject({ kind: "sos", priority: "critical", read: false, link: `/sos?alert=${alert.id}` });
      expect(n!.body).toContain("Car broke down");
    }
    expect(await of(cat.uid, "sos")).toEqual([]); // sender isn't notified of their own SOS
    expect((await listFamilyEvents(home, bob.uid))[0]).toMatchObject({ type: "sos", uid: cat.uid });
  });

  it("does not turn on location sharing or create a live location", async () => {
    await sendSos(cat, { location: { lat: 12.9, lng: 77.5, accuracy: 20 } });
    expect((await adminDb().doc(`locations/${cat.uid}`).get()).exists).toBe(false);
  });

  it("works without a location", async () => {
    const { alert } = await sendSos(bob, { location: null });
    expect(alert.location).toBeNull();
  });

  it("can target only chosen families", async () => {
    const { alert } = await sendSos(cat, { familyIds: [work] });
    expect(alert.recipientCount).toBe(1);
    expect(await of(ann.uid, "sos")).toEqual([]);
    await expectError(getSosForUser(ann.uid, alert.id), 404);
  });

  it("refuses families the sender doesn't belong to, and users with no family", async () => {
    await expectError(sendSos(bob, { familyIds: [work] }), 403, "not_a_member");
    const loner = await makeUser("Lone");
    await expectError(sendSos(loner, {}), 409, "no_family");
  });

  it("a second press while active updates the same alert instead of duplicating", async () => {
    const first = await sendSos(cat, {});
    const second = await sendSos(cat, { location: { lat: 1, lng: 2, accuracy: 5 } });
    expect(second.duplicate).toBe(true);
    expect(second.alert.id).toBe(first.alert.id);
    expect(second.alert.location).toMatchObject({ lat: 1, lng: 2 });
    expect(await of(ann.uid, "sos")).toHaveLength(1);
  });

  it("is rate-limited to stop accidental floods", async () => {
    for (let i = 0; i < 3; i++) {
      const { alert } = await sendSos(bob, {});
      await resolveSos(bob, alert.id, "cancelled");
    }
    await expectError(sendSos(bob, {}), 429, "rate_limited");
  });

  it("recipients acknowledge; the sender is told; outsiders and the sender can't acknowledge", async () => {
    const { alert } = await sendSos(cat, { familyIds: [home] });
    const acked = await acknowledgeSos(bob, alert.id);
    expect(acked.acknowledgedBy.map((a) => a.displayName)).toEqual(["Bob"]);
    await acknowledgeSos(bob, alert.id); // idempotent
    expect((await getSosForUser(cat.uid, alert.id)).acknowledgedBy).toHaveLength(1);
    expect((await of(cat.uid, "sos"))[0]!.title).toBe("Bob saw your SOS");
    await expectError(acknowledgeSos(eve, alert.id), 404);
    await expectError(acknowledgeSos(cat, alert.id), 404);
  });

  it("only the sender cancels; sender or owner/guardian resolves; plain members can't", async () => {
    const a1 = (await sendSos(ann, { familyIds: [home] })).alert;
    await expectError(resolveSos(cat, a1.id, "resolved"), 403);
    await expectError(resolveSos(bob, a1.id, "cancelled"), 403);
    const done = await resolveSos(bob, a1.id, "resolved"); // guardian
    expect(done).toMatchObject({ status: "resolved", resolvedByName: "Bob" });
    await expectError(resolveSos(ann, a1.id, "cancelled"), 409, "not_active");

    const a2 = (await sendSos(cat, { familyIds: [home] })).alert;
    expect((await resolveSos(cat, a2.id, "cancelled")).status).toBe("cancelled");
    expect((await of(ann.uid, "sos"))[0]!.title).toBe("Cat cancelled their SOS");
  });

  it("history: sender + current family members only; removal ends access", async () => {
    const { alert } = await sendSos(cat, { familyIds: [home] });
    expect((await listSosForUser(bob.uid)).map((a) => a.id)).toContain(alert.id);
    expect((await listSosForUser(eve.uid)).map((a) => a.id)).not.toContain(alert.id);
    await removeMember(ann, home, bob.uid);
    expect((await listSosForUser(bob.uid)).map((a) => a.id)).not.toContain(alert.id);
    await expectError(getSosForUser(bob.uid, alert.id), 404);
  });

  it("emergency contacts are stored per user and default to 112", async () => {
    expect(await getEmergencySettings(ann.uid)).toEqual({ contacts: [], emergencyNumber: "112" });
    await saveEmergencySettings(ann.uid, { contacts: [{ name: "Dr Rao", phone: "+919876543210", relationship: "Doctor" }], emergencyNumber: "911" });
    expect((await getEmergencySettings(ann.uid)).contacts[0]!.name).toBe("Dr Rao");
    expect((await getEmergencySettings(bob.uid)).contacts).toEqual([]);
  });
});

describe("Safe zones (geofencing)", () => {
  let zoneId: string;
  beforeEach(async () => {
    zoneId = (await createZone(ann, home, { name: "Home", kind: "home", ...HOME, radius: 150, alertsEnabled: true, notifyOnEnter: true, notifyOnExit: true })).id;
  });

  it("owners/guardians manage zones; members view; outsiders get 404", async () => {
    await createZone(bob, home, { name: "School", kind: "school", lat: 12.98, lng: 77.6, radius: 300, alertsEnabled: true, notifyOnEnter: true, notifyOnExit: false });
    await expectError(createZone(cat, home, { name: "X", kind: "custom", lat: 1, lng: 1, radius: 100, alertsEnabled: true, notifyOnEnter: true, notifyOnExit: true }), 403);
    expect((await listZones(home, cat.uid)).map((z) => z.name)).toEqual(["Home", "School"]);
    await expectError(listZones(home, eve.uid), 404);
    await expectError(updateZone(cat, home, zoneId, { radius: 5000 }), 403);
    await expectError(deleteZone(eve, home, zoneId), 404);
  });

  it("arriving and leaving notify the family (not the person) and log events", async () => {
    await startSharing(cat, { familyIds: [home], keepHistory: false, historyRetentionDays: 7 });
    await recordLocation(cat, FAR); // first observation: no alert
    expect(await zoneAlerts(ann.uid)).toBe(0);
    await recordLocation(cat, AT_HOME);
    const [arrive] = await of(ann.uid, "geofence_enter", "geofence_exit");
    expect(arrive).toMatchObject({ kind: "geofence_enter", title: "Cat arrived at Home" });
    await recordLocation(cat, FAR);
    expect((await of(bob.uid, "geofence_enter", "geofence_exit"))[0]).toMatchObject({ kind: "geofence_exit", title: "Cat left Home" });
    expect(await zoneAlerts(cat.uid)).toBe(0);
    expect((await listFamilyEvents(home, ann.uid)).map((e) => e.type).slice(0, 2)).toEqual(["geofence_exit", "geofence_enter"]);
  });

  it("no alert just because sharing started while already inside", async () => {
    await startSharing(cat, { familyIds: [home], keepHistory: false, historyRetentionDays: 7 });
    await recordLocation(cat, AT_HOME);
    expect(await zoneAlerts(ann.uid)).toBe(0);
  });

  it("GPS jitter at the edge doesn't cause alert storms (hysteresis)", async () => {
    await startSharing(cat, { familyIds: [home], keepHistory: false, historyRetentionDays: 7 });
    await recordLocation(cat, AT_HOME);
    for (let i = 0; i < 3; i++) {
      await recordLocation(cat, EDGE);
      await recordLocation(cat, AT_HOME);
    }
    expect(await zoneAlerts(ann.uid)).toBe(0);
  });

  it("imprecise fixes (accuracy > radius) never trigger alerts", async () => {
    await startSharing(cat, { familyIds: [home], keepHistory: false, historyRetentionDays: 7 });
    await recordLocation(cat, FAR);
    await recordLocation(cat, fix(12.9716, 77.5946, 900));
    expect(await zoneAlerts(ann.uid)).toBe(0);
  });

  it("respects consent: zones of a family you don't share with are never evaluated", async () => {
    const workZone = await createZone(eve, work, { name: "Office", kind: "office", ...HOME, radius: 150, alertsEnabled: true, notifyOnEnter: true, notifyOnExit: true });
    await startSharing(cat, { familyIds: [home], keepHistory: false, historyRetentionDays: 7 });
    await recordLocation(cat, FAR);
    await recordLocation(cat, AT_HOME);
    expect(await zoneAlerts(eve.uid)).toBe(0);
    const loc = (await adminDb().doc(`locations/${cat.uid}`).get()).data()!;
    expect(Object.keys(loc.zoneState)).toEqual([zoneId]);
    expect(loc.zoneState[workZone.id]).toBeUndefined();
  });

  it("per-zone toggles: alerts off, or enter-only", async () => {
    await updateZone(ann, home, zoneId, { notifyOnExit: false });
    await startSharing(cat, { familyIds: [home], keepHistory: false, historyRetentionDays: 7 });
    await recordLocation(cat, FAR);
    await recordLocation(cat, AT_HOME);
    await recordLocation(cat, FAR);
    expect((await of(ann.uid, "geofence_enter", "geofence_exit")).map((n) => n.kind)).toEqual(["geofence_enter"]);
    await updateZone(ann, home, zoneId, { alertsEnabled: false });
    await recordLocation(cat, AT_HOME);
    expect((await of(ann.uid, "geofence_enter", "geofence_exit")).map((n) => n.kind)).toEqual(["geofence_enter"]);
    // events are still logged for the family feed
    expect((await listFamilyEvents(home, ann.uid)).filter((e) => e.type === "geofence_enter")).toHaveLength(2);
  });

  it("deleted zones drop out of the stored zone state; stopping sharing clears it", async () => {
    await startSharing(cat, { familyIds: [home], keepHistory: false, historyRetentionDays: 7 });
    await recordLocation(cat, AT_HOME);
    await deleteZone(ann, home, zoneId);
    await recordLocation(cat, AT_HOME);
    expect((await adminDb().doc(`locations/${cat.uid}`).get()).get("zoneState")).toEqual({});
    await stopSharing(cat.uid);
    expect((await adminDb().doc(`locations/${cat.uid}`).get()).exists).toBe(false);
  });
});

describe("Notifications inbox", () => {
  it("mark one / all read, only in your own inbox", async () => {
    await sendSos(cat, { familyIds: [home] });
    const [n] = await listNotifications(ann.uid);
    await markRead(ann.uid, [n!.id]);
    expect(await zoneAlerts(ann.uid)).toBe(0);
    const [bobs] = await listNotifications(bob.uid);
    await expect(markRead(ann.uid, [bobs!.id])).rejects.toThrow(); // not in ann's inbox
    expect(await unreadCount(bob.uid)).toBe(1);
    expect(await markRead(bob.uid, "all")).toBe(1);
    expect(await unreadCount(bob.uid)).toBe(0);
  });
});

describe("Safe-zone alarms", () => {
  // 5 km around home; 0.05° lat ≈ 5.6 km.
  const FIVE_KM_OUT = fix(12.9716 + 0.05, 77.5946);
  const zone = (over = {}) =>
    createZone(ann, home, { name: "Home", kind: "home", ...HOME, radius: 5000, alertsEnabled: true, notifyOnEnter: true, notifyOnExit: true, alarmOnExit: true, ...over });

  it("leaving raises an alarm for owners and guardians only, with the distance, until they see it", async () => {
    await zone();
    await startSharing(cat, { familyIds: [home], keepHistory: false, historyRetentionDays: 7 });
    await recordLocation(cat, AT_HOME);
    await recordLocation(cat, FIVE_KM_OUT);

    const [alarm] = await listMyZoneAlarms(ann.uid);
    expect(alarm).toMatchObject({ zoneName: "Home", displayName: "Cat", active: true, radius: 5000 });
    expect(alarm!.distanceM).toBeGreaterThan(5000);
    expect(await listMyZoneAlarms(bob.uid)).toHaveLength(1);
    expect(await listMyZoneAlarms(cat.uid)).toEqual([]);
    expect((await of(ann.uid, "geofence_exit"))[0]).toMatchObject({ title: "ALARM: Cat left Home", priority: "critical" });

    await acknowledgeZoneAlarm(ann, alarm!.id);
    expect(await listMyZoneAlarms(ann.uid)).toEqual([]);
    expect(await listMyZoneAlarms(bob.uid)).toHaveLength(1); // bob hasn't seen it yet
    await expectError(acknowledgeZoneAlarm(cat, alarm!.id), 404);
  });

  it("coming back inside clears the alarm and tells the owners", async () => {
    await zone();
    await startSharing(cat, { familyIds: [home], keepHistory: false, historyRetentionDays: 7 });
    await recordLocation(cat, AT_HOME);
    await recordLocation(cat, FIVE_KM_OUT);
    await recordLocation(cat, FIVE_KM_OUT); // still out: no second alarm
    expect(await listMyZoneAlarms(bob.uid)).toHaveLength(1);
    await recordLocation(cat, AT_HOME);
    expect(await listMyZoneAlarms(bob.uid)).toEqual([]);
    expect((await of(ann.uid, "geofence_enter"))[0]).toMatchObject({ title: "Cat is back inside Home" });
  });

  it("a zone watching only some members ignores everyone else", async () => {
    await zone({ watchUids: [bob.uid] });
    await startSharing(cat, { familyIds: [home], keepHistory: false, historyRetentionDays: 7 });
    await recordLocation(cat, AT_HOME);
    await recordLocation(cat, FIVE_KM_OUT);
    expect(await listMyZoneAlarms(ann.uid)).toEqual([]);
    expect(await zoneAlerts(ann.uid)).toBe(0);
    await expectError(zone({ watchUids: [eve.uid] }), 400, "not_member");
  });

  it("turning the alarm off silences alarms already ringing", async () => {
    const z = await zone();
    await startSharing(cat, { familyIds: [home], keepHistory: false, historyRetentionDays: 7 });
    await recordLocation(cat, AT_HOME);
    await recordLocation(cat, FIVE_KM_OUT);
    await updateZone(ann, home, z.id, { alarmOnExit: false });
    expect(await listMyZoneAlarms(ann.uid)).toEqual([]);
  });
});
