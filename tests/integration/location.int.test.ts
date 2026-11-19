import { Timestamp } from "firebase-admin/firestore";
import { beforeEach, describe, expect, it } from "vitest";
import type { SessionUser } from "@/lib/auth/session";
import { adminDb } from "@/lib/firebase/admin";
import { createFamily, deleteFamily, inviteMember, removeMember, respondToInvitation } from "@/lib/families/service.server";
import {
  countSharingWithMe,
  deleteMyHistory,
  getFamilyLocations,
  getMySharingState,
  listMyHistory,
  recordLocation,
  requestLocationShare,
  startSharing,
  stopSharing,
  updateSharing,
} from "@/lib/location/service.server";
import { listNotifications } from "@/lib/notifications/service.server";
import { expectError, makeUser, wipe } from "./helpers";

let ann: SessionUser, bob: SessionUser, cat: SessionUser, eve: SessionUser;
let home: string, work: string;

const fix = (lat = 12.9716, lng = 77.5946, over = {}) => ({ lat, lng, accuracy: 12, timestamp: Date.now(), ...over });
const locDoc = (uid: string) => adminDb().doc(`locations/${uid}`).get();

async function join(owner: SessionUser, familyId: string, who: SessionUser) {
  const inv = await inviteMember(owner, familyId, { email: who.email!, role: "member" });
  await respondToInvitation(who, inv.id, true);
}

beforeEach(async () => {
  await wipe();
  ann = await makeUser("Ann");
  bob = await makeUser("Bob");
  cat = await makeUser("Cat");
  eve = await makeUser("Eve");
  home = (await createFamily(ann, "Home")).id; // ann, bob
  work = (await createFamily(ann, "Work")).id; // ann, cat
  await join(ann, home, bob);
  await join(ann, work, cat);
});

describe("consent is required", () => {
  it("new users are NOT sharing and have no location", async () => {
    const s = await getMySharingState(ann.uid);
    expect(s.consent.active).toBe(false);
    expect(s.location).toBeNull();
    expect((await locDoc(ann.uid)).exists).toBe(false);
  });

  it("a location sent without consent is refused and nothing is stored", async () => {
    await expectError(recordLocation(ann, fix()), 409, "not_sharing");
    expect((await locDoc(ann.uid)).exists).toBe(false);
  });

  it("you can only share with families you belong to", async () => {
    await expectError(startSharing(eve, { familyIds: [home], keepHistory: false, historyRetentionDays: 7 }), 403, "not_a_member");
    await expectError(startSharing(bob, { familyIds: [home, work], keepHistory: false, historyRetentionDays: 7 }), 403);
  });

  it("stale or future fixes are rejected", async () => {
    await startSharing(ann, { familyIds: [home], keepHistory: false, historyRetentionDays: 7 });
    await expectError(recordLocation(ann, fix(1, 1, { timestamp: Date.now() - 10 * 60_000 })), 422, "stale_fix");
    await expectError(recordLocation(ann, fix(1, 1, { timestamp: Date.now() + 10 * 60_000 })), 422);
  });
});

describe("sharing with chosen families only", () => {
  beforeEach(async () => {
    await startSharing(ann, { familyIds: [home], keepHistory: false, historyRetentionDays: 7 });
    await recordLocation(ann, fix());
  });

  it("stores the fix with accuracy, timestamp and the chosen audience", async () => {
    const d = (await locDoc(ann.uid)).data()!;
    expect(d.sharedWith).toEqual([home]);
    expect(d.accuracy).toBe(12);
    const s = await getMySharingState(ann.uid);
    expect(s.location?.presence).toBe("online");
  });

  it("members of the chosen family see it; the other family does not", async () => {
    const homeView = await getFamilyLocations(home, bob.uid);
    expect(homeView.find((m) => m.uid === ann.uid)?.location?.lat).toBeCloseTo(12.9716);
    const workView = await getFamilyLocations(work, cat.uid);
    expect(workView.find((m) => m.uid === ann.uid)?.sharing).toBe(false);
    expect(workView.find((m) => m.uid === ann.uid)?.location).toBeNull();
  });

  it("outsiders can't view the family's locations at all", async () => {
    await expectError(getFamilyLocations(home, eve.uid), 404);
    await expectError(getFamilyLocations(home, cat.uid), 404);
  });

  it("widening and narrowing the audience takes effect immediately", async () => {
    await updateSharing(ann, { familyIds: [home, work] });
    expect((await getFamilyLocations(work, cat.uid)).find((m) => m.uid === ann.uid)?.sharing).toBe(true);
    await updateSharing(ann, { familyIds: [work] });
    expect((await getFamilyLocations(home, bob.uid)).find((m) => m.uid === ann.uid)?.sharing).toBe(false);
  });

  it("dashboard count reflects people sharing with me", async () => {
    expect(await countSharingWithMe(bob.uid)).toEqual({ sharing: 1, online: 1 });
    expect(await countSharingWithMe(cat.uid)).toEqual({ sharing: 0, online: 0 });
  });
});

describe("revocation", () => {
  beforeEach(async () => {
    await startSharing(ann, { familyIds: [home, work], keepHistory: false, historyRetentionDays: 7 });
    await recordLocation(ann, fix());
  });

  it("stopping DELETES the live location and blocks further updates", async () => {
    await stopSharing(ann.uid);
    expect((await locDoc(ann.uid)).exists).toBe(false);
    expect((await getFamilyLocations(home, bob.uid)).find((m) => m.uid === ann.uid)?.location).toBeNull();
    const s = await getMySharingState(ann.uid);
    expect(s.consent.active).toBe(false);
    expect(s.consent.revokedAt).toBeGreaterThan(0);
    // A stale tab still posting is refused.
    await expectError(recordLocation(ann, fix()), 409, "not_sharing");
  });

  it("an update racing with stop-sharing never crashes: it either succeeds with the stored fix or is refused", async () => {
    for (let i = 0; i < 5; i++) {
      await startSharing(ann, { familyIds: [home], keepHistory: false, historyRetentionDays: 7 });
      const [update] = await Promise.allSettled([recordLocation(ann, fix(12 + i / 100, 77)), stopSharing(ann.uid)]);
      if (update.status === "fulfilled") {
        expect(update.value.lat).toBeCloseTo(12 + i / 100);
        expect(update.value.accuracy).toBe(12);
        expect(update.value.presence).toBe("online");
      } else {
        expect(update.reason).toMatchObject({ status: 409 });
      }
      expect((await locDoc(ann.uid)).exists).toBe(false);
    }
  });

  it("removing a member withdraws their location from that family", async () => {
    await join(ann, home, cat); // cat now in both
    await startSharing(cat, { familyIds: [home, work], keepHistory: false, historyRetentionDays: 7 });
    await recordLocation(cat, fix(13, 77));
    await removeMember(ann, home, cat.uid);
    expect((await locDoc(cat.uid)).data()!.sharedWith).toEqual([work]);
    expect((await getMySharingState(cat.uid)).consent.familyIds).toEqual([work]);
  });

  it("a viewer who is removed can no longer see the family's locations", async () => {
    await removeMember(ann, home, bob.uid);
    await expectError(getFamilyLocations(home, bob.uid), 404);
  });

  it("leaving your last shared family stops sharing entirely", async () => {
    await startSharing(bob, { familyIds: [home], keepHistory: false, historyRetentionDays: 7 });
    await recordLocation(bob, fix(13, 78));
    await removeMember(bob, home, bob.uid);
    expect((await locDoc(bob.uid)).exists).toBe(false);
    expect((await getMySharingState(bob.uid)).consent.active).toBe(false);
  });

  it("deleting a family removes it from every member's sharing", async () => {
    await deleteFamily(ann, home);
    expect((await locDoc(ann.uid)).data()!.sharedWith).toEqual([work]);
  });
});

describe("location history (opt-in, owner-only, deletable)", () => {
  it("is not recorded unless the user opted in", async () => {
    await startSharing(ann, { familyIds: [home], keepHistory: false, historyRetentionDays: 7 });
    await recordLocation(ann, fix());
    expect(await listMyHistory(ann.uid)).toEqual([]);
  });

  it("records meaningful moves with an expiry matching the retention choice", async () => {
    await startSharing(ann, { familyIds: [home], keepHistory: true, historyRetentionDays: 1 });
    await recordLocation(ann, fix(12.9716, 77.5946));
    await recordLocation(ann, fix(12.97161, 77.59461)); // ~1 m — skipped
    await recordLocation(ann, fix(12.98, 77.6)); // ~1 km — recorded
    const pts = await listMyHistory(ann.uid);
    expect(pts).toHaveLength(2);
    const raw = await adminDb().collection(`locationHistory/${ann.uid}/points`).get();
    const ttl = raw.docs[0]!.get("expireAt").toMillis() - raw.docs[0]!.get("recordedAt").toMillis();
    expect(ttl).toBe(24 * 60 * 60 * 1000);
  });

  it("expired points are hidden and pruned", async () => {
    await startSharing(ann, { familyIds: [home], keepHistory: true, historyRetentionDays: 1 });
    await recordLocation(ann, fix());
    const raw = await adminDb().collection(`locationHistory/${ann.uid}/points`).get();
    await raw.docs[0]!.ref.update({ expireAt: Timestamp.fromMillis(Date.now() - 1) });
    expect(await listMyHistory(ann.uid)).toEqual([]);
    await recordLocation(ann, fix(13.5, 78)); // triggers prune
    const after = await adminDb().collection(`locationHistory/${ann.uid}/points`).get();
    expect(after.size).toBe(1);
  });

  it("can be deleted completely", async () => {
    await startSharing(ann, { familyIds: [home], keepHistory: true, historyRetentionDays: 30 });
    await recordLocation(ann, fix(12, 77));
    await recordLocation(ann, fix(13, 78));
    expect(await deleteMyHistory(ann.uid)).toBe(2);
    expect(await listMyHistory(ann.uid)).toEqual([]);
  });
});

describe("asking a member to share", () => {
  it("notifies the member, links to the family, and changes nothing about consent", async () => {
    await requestLocationShare(ann, home, bob.uid);
    const [n] = await listNotifications(bob.uid);
    expect(n).toMatchObject({ kind: "sharing_request", title: "Ann asked you to share your location", link: `/family/${home}` });
    expect((await getMySharingState(bob.uid)).consent.active).toBe(false);
  });

  it("is refused once they already share with that family, and for outsiders or non-members", async () => {
    await startSharing(bob, { familyIds: [home], keepHistory: false, historyRetentionDays: 7 });
    await expectError(requestLocationShare(ann, home, bob.uid), 409, "already_sharing");
    await expectError(requestLocationShare(eve, home, bob.uid), 404);
    await expectError(requestLocationShare(ann, home, eve.uid), 404, "not_member");
    await expectError(requestLocationShare(ann, home, ann.uid), 400);
  });
});
