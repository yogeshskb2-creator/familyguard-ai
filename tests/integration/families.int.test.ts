import { Timestamp } from "firebase-admin/firestore";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { SessionUser } from "@/lib/auth/session";
import { adminAuth, adminDb } from "@/lib/firebase/admin";
import { FamilyError } from "@/lib/families/errors";
import {
  changeMemberRole,
  createFamily,
  deleteFamily,
  getFamilyForMember,
  getJoinLink,
  inviteMember,
  renewInvitationLink,
  respondByJoinLink,
  listFamilyInvitations,
  listMyFamilies,
  listMyInvitations,
  removeMember,
  renameFamily,
  respondToInvitation,
  revokeInvitation,
} from "@/lib/families/service.server";
import { ensureUserProfile, getUserProfile, updateUserProfile } from "@/lib/users/profile.server";

const PROJECT = "demo-familyguard-int";

async function wipe() {
  await fetch(`http://127.0.0.1:8080/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, { method: "DELETE" });
  await fetch(`http://127.0.0.1:9099/emulator/v1/projects/${PROJECT}/accounts`, { method: "DELETE" });
}

let n = 0;
async function makeUser(over: Partial<SessionUser> = {}): Promise<SessionUser> {
  n++;
  const email = over.email === undefined ? `user${n}@example.com` : over.email;
  const record = await adminAuth().createUser({
    email: email ?? undefined,
    phoneNumber: over.phoneNumber ?? undefined,
    emailVerified: over.emailVerified ?? true,
    displayName: over.displayName ?? `User ${n}`,
  });
  const user: SessionUser = {
    uid: record.uid,
    email: email ?? null,
    emailVerified: over.emailVerified ?? true,
    displayName: over.displayName ?? `User ${n}`,
    phoneNumber: over.phoneNumber ?? null,
    photoURL: null,
    signInProvider: over.phoneNumber && !email ? "phone" : "password",
    isAdmin: false,
  };
  await ensureUserProfile(user);
  return user;
}

async function expectError(p: Promise<unknown>, status: number, code?: string) {
  const err = await p.then(
    () => null,
    (e) => e,
  );
  expect(err, "expected the call to be rejected").toBeInstanceOf(FamilyError);
  expect(err.status).toBe(status);
  if (code) expect(err.code).toBe(code);
}

let owner: SessionUser, guardian: SessionUser, kid: SessionUser, stranger: SessionUser;
let familyId: string;

/** owner creates a family; guardian and kid are invited and accept. */
async function seedFamily() {
  owner = await makeUser({ displayName: "Ananya" });
  guardian = await makeUser({ displayName: "Rohan" });
  kid = await makeUser({ displayName: "Meera" });
  stranger = await makeUser({ displayName: "Mallory" });
  familyId = (await createFamily(owner, "Sharma Family")).id;
  const g = await inviteMember(owner, familyId, { email: guardian.email!, role: "guardian" });
  await respondToInvitation(guardian, g.id, true);
  const k = await inviteMember(owner, familyId, { email: kid.email!, role: "member" });
  await respondToInvitation(kid, k.id, true);
}

beforeAll(wipe);
beforeEach(async () => {
  await wipe();
  await seedFamily();
});

describe("creating a family", () => {
  it("makes the creator the owner and links the family to their profile", async () => {
    const fam = await getFamilyForMember(familyId, owner.uid);
    expect(fam.name).toBe("Sharma Family");
    expect(fam.myRole).toBe("owner");
    expect(fam.members.map((m) => [m.displayName, m.role])).toEqual([
      ["Ananya", "owner"],
      ["Rohan", "guardian"],
      ["Meera", "member"],
    ]);
    expect(new Set(fam.members.map((m) => m.color)).size).toBe(3); // distinct map colours
    expect((await getUserProfile(owner.uid))!.familyIds).toEqual([familyId]);
    expect((await getUserProfile(kid.uid))!.familyIds).toEqual([familyId]);
  });

  it("caps families per user", async () => {
    for (let i = 0; i < 5; i++) await createFamily(stranger, `F${i}`);
    await expectError(createFamily(stranger, "One too many"), 409, "family_limit");
  });
});

describe("access control", () => {
  it("non-members get 404 (no existence leak)", async () => {
    await expectError(getFamilyForMember(familyId, stranger.uid), 404, "not_found");
    await expectError(getFamilyForMember("doesNotExist123", stranger.uid), 404, "not_found");
    expect(await listMyFamilies(stranger.uid)).toEqual([]);
  });

  it("only owners/guardians can see the family's pending invitations", async () => {
    await inviteMember(owner, familyId, { email: "pending@example.com", role: "member" });
    expect(await listFamilyInvitations(familyId, owner.uid)).toHaveLength(1);
    expect(await listFamilyInvitations(familyId, guardian.uid)).toHaveLength(1);
    await expectError(listFamilyInvitations(familyId, kid.uid), 403);
    await expectError(listFamilyInvitations(familyId, stranger.uid), 404);
  });

  it("only the owner can rename or delete", async () => {
    await expectError(renameFamily(guardian, familyId, "Hijacked"), 403);
    await expectError(renameFamily(stranger, familyId, "Hijacked"), 404);
    await expectError(deleteFamily(guardian, familyId), 403);
    await expectError(deleteFamily(kid, familyId), 403);
    await renameFamily(owner, familyId, "The Sharmas");
    expect((await getFamilyForMember(familyId, kid.uid)).name).toBe("The Sharmas");
  });
});

describe("invitations", () => {
  it("members and strangers cannot invite", async () => {
    await expectError(inviteMember(kid, familyId, { email: "x@example.com", role: "member" }), 403);
    await expectError(inviteMember(stranger, familyId, { email: "x@example.com", role: "member" }), 404);
  });

  it("guardians can invite members but not guardians", async () => {
    await inviteMember(guardian, familyId, { email: "x@example.com", role: "member" });
    await expectError(inviteMember(guardian, familyId, { email: "y@example.com", role: "guardian" }), 403);
  });

  it("rejects duplicates, self-invites and existing members", async () => {
    await inviteMember(owner, familyId, { email: "dup@example.com", role: "member" });
    await expectError(inviteMember(owner, familyId, { email: "DUP@example.com", role: "member" }), 409, "already_invited");
    await expectError(inviteMember(owner, familyId, { email: owner.email!, role: "member" }), 400, "self_invite");
    await expectError(inviteMember(owner, familyId, { email: kid.email!, role: "member" }), 409, "already_member");
  });

  it("returns the same result whether or not the invitee has an account", async () => {
    const a = await inviteMember(owner, familyId, { email: stranger.email!, role: "member" });
    const b = await inviteMember(owner, familyId, { email: "no-account@example.com", role: "member" });
    expect(Object.keys(a).sort()).toEqual(Object.keys(b).sort());
    expect([a.status, b.status]).toEqual(["pending", "pending"]);
  });

  it("only the addressed person can see and accept an invitation", async () => {
    const inv = await inviteMember(owner, familyId, { email: stranger.email!, role: "member" });
    const eve = await makeUser({ displayName: "Eve" });
    expect(await listMyInvitations(eve)).toEqual([]);
    await expectError(respondToInvitation(eve, inv.id, true), 404, "not_found");
    await expectError(respondToInvitation(owner, inv.id, true), 404, "not_found");

    const mine = await listMyInvitations(stranger);
    expect(mine.map((i) => i.familyName)).toEqual(["Sharma Family"]);
    await respondToInvitation(stranger, inv.id, true);
    expect((await getFamilyForMember(familyId, stranger.uid)).myRole).toBe("member");
  });

  it("an UNVERIFIED email cannot claim an invitation sent to that address", async () => {
    const squatter = await makeUser({ email: "victim@example.com", emailVerified: false });
    const inv = await inviteMember(owner, familyId, { email: "victim@example.com", role: "member" });
    expect(await listMyInvitations(squatter)).toEqual([]);
    await expectError(respondToInvitation(squatter, inv.id, true), 404);
  });

  it("phone invitations are claimed by the user who signed in with that phone", async () => {
    const phoneUser = await makeUser({ email: null, phoneNumber: "+15550001234", displayName: "Kabir" });
    const inv = await inviteMember(owner, familyId, { phone: "+15550001234", role: "member" });
    expect(await listMyInvitations(phoneUser)).toHaveLength(1);
    await respondToInvitation(phoneUser, inv.id, true);
    expect((await getFamilyForMember(familyId, owner.uid)).members.map((m) => m.displayName)).toContain("Kabir");
  });

  it("rejecting does not add the member, and can't be undone by accepting later", async () => {
    const inv = await inviteMember(owner, familyId, { email: stranger.email!, role: "member" });
    await respondToInvitation(stranger, inv.id, false);
    await expectError(getFamilyForMember(familyId, stranger.uid), 404);
    await expectError(respondToInvitation(stranger, inv.id, true), 409, "not_pending");
    expect(await listMyInvitations(stranger)).toEqual([]);
  });

  it("revoked invitations can't be accepted", async () => {
    const inv = await inviteMember(owner, familyId, { email: stranger.email!, role: "member" });
    await expectError(revokeInvitation(kid, familyId, inv.id), 403);
    await revokeInvitation(owner, familyId, inv.id);
    await expectError(respondToInvitation(stranger, inv.id, true), 409, "not_pending");
  });

  it("expired invitations can't be accepted", async () => {
    const inv = await inviteMember(owner, familyId, { email: stranger.email!, role: "member" });
    await adminDb().doc(`familyInvitations/${inv.id}`).update({ expiresAt: Timestamp.fromMillis(Date.now() - 1000) });
    expect(await listMyInvitations(stranger)).toEqual([]);
    await expectError(respondToInvitation(stranger, inv.id, true), 410, "expired");
  });

  it("the invited role is fixed by the inviter, not the invitee", async () => {
    const inv = await inviteMember(guardian, familyId, { email: stranger.email!, role: "member" });
    await respondToInvitation(stranger, inv.id, true);
    const me = (await getFamilyForMember(familyId, stranger.uid)).members.find((m) => m.uid === stranger.uid)!;
    expect(me.role).toBe("member");
  });
});

describe("roles and removal", () => {
  it("only the owner changes roles, and nobody can become owner", async () => {
    await expectError(changeMemberRole(guardian, familyId, kid.uid, "guardian"), 403);
    await expectError(changeMemberRole(kid, familyId, kid.uid, "guardian"), 403);
    await expectError(changeMemberRole(owner, familyId, kid.uid, "owner" as never), 403);
    await changeMemberRole(owner, familyId, kid.uid, "guardian");
    expect((await getFamilyForMember(familyId, kid.uid)).myRole).toBe("guardian");
  });

  it("guardians remove plain members only", async () => {
    await expectError(removeMember(guardian, familyId, owner.uid), 403);
    await removeMember(guardian, familyId, kid.uid);
    await expectError(getFamilyForMember(familyId, kid.uid), 404);
    expect((await getUserProfile(kid.uid))!.familyIds).toEqual([]);
  });

  it("members can't remove others but can leave", async () => {
    await expectError(removeMember(kid, familyId, guardian.uid), 403);
    await removeMember(kid, familyId, kid.uid);
    await expectError(getFamilyForMember(familyId, kid.uid), 404);
  });

  it("the owner can't leave (must delete the family)", async () => {
    await expectError(removeMember(owner, familyId, owner.uid), 403);
  });

  it("a removed member loses access immediately and can rejoin only by a new invitation", async () => {
    await removeMember(owner, familyId, kid.uid);
    expect(await listMyFamilies(kid.uid)).toEqual([]);
    const inv = await inviteMember(owner, familyId, { email: kid.email!, role: "member" });
    await respondToInvitation(kid, inv.id, true);
    expect((await listMyFamilies(kid.uid)).map((f) => f.id)).toEqual([familyId]);
  });

  it("deleting the family unlinks every member and voids pending invitations", async () => {
    const inv = await inviteMember(owner, familyId, { email: stranger.email!, role: "member" });
    await deleteFamily(owner, familyId);
    for (const u of [owner, guardian, kid]) {
      expect((await getUserProfile(u.uid))!.familyIds).toEqual([]);
      await expectError(getFamilyForMember(familyId, u.uid), 404);
    }
    await expectError(respondToInvitation(stranger, inv.id, true), 409, "not_pending");
  });
});

describe("profile sync", () => {
  it("renaming yourself updates your name in every family", async () => {
    await updateUserProfile(kid.uid, { displayName: "Meera S" });
    const fam = await getFamilyForMember(familyId, owner.uid);
    expect(fam.members.find((m) => m.uid === kid.uid)!.displayName).toBe("Meera S");
  });
});

describe("join links", () => {
  it("a link-only invitation lets whoever opens it join, exactly once", async () => {
    const inv = await inviteMember(owner, familyId, { role: "member" });
    expect(inv.joinToken).toMatch(/^[A-Za-z0-9_-]{32}$/);
    expect([inv.inviteeEmail, inv.inviteePhone]).toEqual([null, null]);

    const view = await getJoinLink(stranger, inv.joinToken);
    expect(view).toMatchObject({ familyId, familyName: "Sharma Family", invitedByName: "Ananya", role: "member", alreadyMember: false });

    expect(await respondByJoinLink(stranger, inv.joinToken, true)).toEqual({ familyId });
    expect((await getFamilyForMember(familyId, stranger.uid)).myRole).toBe("member");

    const eve = await makeUser({ displayName: "Eve" });
    await expectError(getJoinLink(eve, inv.joinToken), 404, "invalid_link");
    await expectError(respondByJoinLink(eve, inv.joinToken, true), 404, "invalid_link");
  });

  it("only the token's hash is stored, never the link itself", async () => {
    const inv = await inviteMember(owner, familyId, { role: "member" });
    const stored = (await adminDb().doc(`familyInvitations/${inv.id}`).get()).data()!;
    expect(JSON.stringify(stored)).not.toContain(inv.joinToken);
    expect(stored.linkTokenHash).toMatch(/^[0-9a-f]{64}$/);
    const listed = await listFamilyInvitations(familyId, owner.uid);
    expect(listed.length).toBeGreaterThan(0);
    expect(listed.every((i) => !("joinToken" in i) && !("linkTokenHash" in i))).toBe(true);
  });

  it("the role comes from the invitation, and existing members can't use a link twice", async () => {
    const inv = await inviteMember(guardian, familyId, { role: "member" });
    expect((await getJoinLink(kid, inv.joinToken)).alreadyMember).toBe(true);
    await expectError(respondByJoinLink(kid, inv.joinToken, true), 409, "already_member");
    await respondByJoinLink(stranger, inv.joinToken, true);
    const me = (await getFamilyForMember(familyId, stranger.uid)).members.find((m) => m.uid === stranger.uid)!;
    expect(me.role).toBe("member");
  });

  it("declining through the link closes it", async () => {
    const inv = await inviteMember(owner, familyId, { role: "member" });
    await respondByJoinLink(stranger, inv.joinToken, false);
    await expectError(getFamilyForMember(familyId, stranger.uid), 404);
    await expectError(respondByJoinLink(stranger, inv.joinToken, true), 404, "invalid_link");
  });

  it("revoked, expired, replaced and made-up links don't work", async () => {
    const revoked = await inviteMember(owner, familyId, { role: "member" });
    await revokeInvitation(owner, familyId, revoked.id);
    await expectError(respondByJoinLink(stranger, revoked.joinToken, true), 404, "invalid_link");

    const expired = await inviteMember(owner, familyId, { role: "member" });
    await adminDb().doc(`familyInvitations/${expired.id}`).update({ expiresAt: Timestamp.fromMillis(Date.now() - 1000) });
    await expectError(respondByJoinLink(stranger, expired.joinToken, true), 410, "expired");

    const renewed = await inviteMember(owner, familyId, { role: "member" });
    await expectError(renewInvitationLink(kid, familyId, renewed.id), 403);
    const { joinToken } = await renewInvitationLink(owner, familyId, renewed.id);
    expect(joinToken).not.toBe(renewed.joinToken);
    await expectError(respondByJoinLink(stranger, renewed.joinToken, true), 404, "invalid_link");

    await expectError(respondByJoinLink(stranger, "A".repeat(32), true), 404, "invalid_link");
    await respondByJoinLink(stranger, joinToken, true);
    expect((await getFamilyForMember(familyId, stranger.uid)).myRole).toBe("member");
  });

  it("an email invitation's link also works for someone signed in with a different email", async () => {
    const inv = await inviteMember(owner, familyId, { email: "papa-old@example.com", role: "member" });
    await respondByJoinLink(stranger, inv.joinToken, true);
    expect((await getFamilyForMember(familyId, stranger.uid)).myRole).toBe("member");
    expect(await listFamilyInvitations(familyId, owner.uid)).toEqual([]);
  });
});
