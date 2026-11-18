import "server-only";
import { FieldValue, Timestamp, type DocumentData, type Transaction } from "firebase-admin/firestore";
import { adminAuth, adminDb } from "@/lib/firebase/admin";
import type { SessionUser } from "@/lib/auth/session";
import type { FamilyInvitation, FamilyMember, FamilyRole, InvitationStatus } from "@/types/models";
import { FamilyError, forbidden, notFound } from "./errors";
import {
  LIMITS,
  canChangeRole,
  canDeleteFamily,
  canInviteAs,
  canManageInvites,
  canRemoveMember,
  canRenameFamily,
  nextMemberColor,
} from "./permissions";
import type { InviteInput } from "./validation";
import { detachFamilyFromSharing, locRef, userRef } from "@/lib/location/detach.server";
import { PushOutbox } from "@/lib/notifications/push.server";
import { queueNotification } from "@/lib/notifications/service.server";

/*
 * Every mutation here:
 *  1. re-reads the family inside a transaction,
 *  2. derives the actor's role from that fresh snapshot (never from the client),
 *  3. checks the pure policy in ./permissions,
 *  4. writes family + user docs atomically.
 * Clients have NO write access to families/ or familyInvitations/ (see firestore.rules).
 */

const db = () => adminDb();
const families = () => db().collection("families");
const invitations = () => db().collection("familyInvitations");
const users = () => db().collection("users");

const ms = (v: unknown) => (v instanceof Timestamp ? v.toMillis() : typeof v === "number" ? v : 0);

export interface FamilyView {
  id: string;
  name: string;
  ownerId: string;
  myRole: FamilyRole;
  members: FamilyMember[];
  createdAt: number;
}

export interface InvitationView extends FamilyInvitation {
  respondedAt: number | null;
}

const ROLE_ORDER: Record<FamilyRole, number> = { owner: 0, guardian: 1, member: 2 };

function toFamilyView(id: string, d: DocumentData, viewerUid: string): FamilyView {
  const members = Object.values((d.members ?? {}) as Record<string, DocumentData>)
    .map((m) => ({
      uid: m.uid as string,
      displayName: m.displayName as string,
      role: m.role as FamilyRole,
      color: m.color as string,
      joinedAt: ms(m.joinedAt),
    }))
    .sort((a, b) => ROLE_ORDER[a.role] - ROLE_ORDER[b.role] || a.joinedAt - b.joinedAt);
  return {
    id,
    name: d.name,
    ownerId: d.ownerId,
    myRole: (d.members?.[viewerUid]?.role ?? "member") as FamilyRole,
    members,
    createdAt: ms(d.createdAt),
  };
}

function toInvitationView(id: string, d: DocumentData): InvitationView {
  const status = d.status as InvitationStatus;
  const expired = status === "pending" && ms(d.expiresAt) <= Date.now();
  return {
    id,
    familyId: d.familyId,
    familyName: d.familyName,
    invitedBy: d.invitedBy,
    invitedByName: d.invitedByName,
    inviteeEmail: d.inviteeEmail ?? null,
    inviteePhone: d.inviteePhone ?? null,
    role: d.role,
    status: expired ? "expired" : status,
    createdAt: ms(d.createdAt),
    expiresAt: ms(d.expiresAt),
    respondedAt: d.respondedAt ? ms(d.respondedAt) : null,
  };
}

/** Reads the family in a transaction and returns the actor's role; non-members get 404. */
async function loadForMember(tx: Transaction, familyId: string, uid: string) {
  const ref = families().doc(familyId);
  const snap = await tx.get(ref);
  const data = snap.data();
  if (!snap.exists || !data || !(data.memberIds as string[]).includes(uid)) throw notFound();
  return { ref, data, role: data.members[uid].role as FamilyRole };
}

async function profileName(tx: Transaction, uid: string, fallback: string) {
  const snap = await tx.get(users().doc(uid));
  return { name: (snap.get("displayName") as string | undefined) ?? fallback, familyIds: (snap.get("familyIds") as string[] | undefined) ?? [], exists: snap.exists };
}

// ── Queries ────────────────────────────────────────────────

export async function listMyFamilies(uid: string): Promise<FamilyView[]> {
  const snap = await families().where("memberIds", "array-contains", uid).get();
  return snap.docs.map((d) => toFamilyView(d.id, d.data(), uid)).sort((a, b) => a.createdAt - b.createdAt);
}

export async function getFamilyForMember(familyId: string, uid: string): Promise<FamilyView> {
  const snap = await families().doc(familyId).get();
  const data = snap.data();
  if (!snap.exists || !data || !(data.memberIds as string[]).includes(uid)) throw notFound();
  return toFamilyView(snap.id, data, uid);
}

/** Pending invitations a family has sent — owners and guardians only. */
export async function listFamilyInvitations(familyId: string, uid: string): Promise<InvitationView[]> {
  const family = await getFamilyForMember(familyId, uid);
  if (!canManageInvites(family.myRole)) throw forbidden();
  const snap = await invitations().where("familyId", "==", familyId).where("status", "==", "pending").get();
  return snap.docs
    .map((d) => toInvitationView(d.id, d.data()))
    .sort((a, b) => b.createdAt - a.createdAt);
}

/**
 * Invitations addressed to this user. Email matches count only when the
 * email is VERIFIED — otherwise anyone could register with someone else's
 * address and claim their invitations.
 */
export async function listMyInvitations(user: SessionUser): Promise<InvitationView[]> {
  const queries = [];
  if (user.email && user.emailVerified) {
    queries.push(invitations().where("inviteeEmail", "==", user.email.toLowerCase()).where("status", "==", "pending").get());
  }
  if (user.phoneNumber) {
    queries.push(invitations().where("inviteePhone", "==", user.phoneNumber).where("status", "==", "pending").get());
  }
  const snaps = await Promise.all(queries);
  const seen = new Set<string>();
  return snaps
    .flatMap((s) => s.docs)
    .filter((d) => !seen.has(d.id) && seen.add(d.id))
    .map((d) => toInvitationView(d.id, d.data()))
    .filter((i) => i.status === "pending")
    .sort((a, b) => b.createdAt - a.createdAt);
}

// ── Family lifecycle ───────────────────────────────────────

export async function createFamily(user: SessionUser, name: string): Promise<FamilyView> {
  const ref = families().doc();
  await db().runTransaction(async (tx) => {
    const profile = await profileName(tx, user.uid, user.displayName);
    if (!profile.exists) throw new FamilyError(409, "no_profile", "Your profile isn't set up yet. Sign in again.");
    if (profile.familyIds.length >= LIMITS.maxFamiliesPerUser) {
      throw new FamilyError(409, "family_limit", `You can belong to at most ${LIMITS.maxFamiliesPerUser} families.`);
    }
    tx.create(ref, {
      name,
      ownerId: user.uid,
      memberIds: [user.uid],
      members: {
        [user.uid]: {
          uid: user.uid,
          displayName: profile.name,
          role: "owner",
          color: nextMemberColor([]),
          joinedAt: FieldValue.serverTimestamp(),
        },
      },
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    tx.update(users().doc(user.uid), { familyIds: FieldValue.arrayUnion(ref.id), updatedAt: FieldValue.serverTimestamp() });
  });
  return getFamilyForMember(ref.id, user.uid);
}

export async function renameFamily(user: SessionUser, familyId: string, name: string): Promise<void> {
  await db().runTransaction(async (tx) => {
    const { ref, role } = await loadForMember(tx, familyId, user.uid);
    if (!canRenameFamily(role)) throw forbidden("Only the family owner can rename the family.");
    tx.update(ref, { name, updatedAt: FieldValue.serverTimestamp() });
  });
}

/** Owner only. Removes the family from every member and voids its pending invitations. */
export async function deleteFamily(user: SessionUser, familyId: string): Promise<void> {
  await db().runTransaction(async (tx) => {
    const { ref, data, role } = await loadForMember(tx, familyId, user.uid);
    if (!canDeleteFamily(role)) throw forbidden("Only the family owner can delete the family.");
    const pending = await tx.get(invitations().where("familyId", "==", familyId).where("status", "==", "pending"));
    const memberIds = data.memberIds as string[];
    const userSnaps = await Promise.all(memberIds.map((uid) => tx.get(userRef(uid))));
    const locSnaps = await Promise.all(memberIds.map((uid) => tx.get(locRef(uid))));
    memberIds.forEach((uid, i) => {
      tx.update(users().doc(uid), { familyIds: FieldValue.arrayRemove(familyId), updatedAt: FieldValue.serverTimestamp() });
      // Nobody keeps sharing their location with a family that no longer exists.
      detachFamilyFromSharing(tx, uid, familyId, userSnaps[i]!, locSnaps[i]!);
    });
    for (const inv of pending.docs) tx.update(inv.ref, { status: "revoked", respondedAt: FieldValue.serverTimestamp() });
    tx.delete(ref);
  });
}

// ── Invitations ────────────────────────────────────────────

/**
 * The existing account the invitation is addressed to, if any — and whether
 * it may be NOTIFIED: email invites only notify a VERIFIED owner of that
 * address (otherwise someone who merely registered the address could learn
 * the family's name). The inviter's response never reveals any of this.
 */
async function existingInvitee(input: InviteInput): Promise<{ uid: string; notifiable: boolean } | null> {
  try {
    const u = input.email ? await adminAuth().getUserByEmail(input.email) : await adminAuth().getUserByPhoneNumber(input.phone!);
    return { uid: u.uid, notifiable: input.email ? u.emailVerified === true : true };
  } catch {
    return null;
  }
}

/**
 * The response is identical whether or not the invitee has an account, so
 * inviting can't be used to discover who uses FamilyGuard.
 */
export async function inviteMember(user: SessionUser, familyId: string, input: InviteInput): Promise<InvitationView> {
  const inviteeEmail = input.email?.toLowerCase() ?? null;
  const inviteePhone = input.phone ?? null;
  if ((inviteeEmail && inviteeEmail === user.email?.toLowerCase()) || (inviteePhone && inviteePhone === user.phoneNumber)) {
    throw new FamilyError(400, "self_invite", "You can't invite yourself.");
  }
  const invitee = await existingInvitee(input);
  const inviteeUid = invitee?.uid ?? null;
  const ref = invitations().doc();
  const outbox = new PushOutbox();

  await db().runTransaction(async (tx) => {
    outbox.reset();
    const { data, role } = await loadForMember(tx, familyId, user.uid);
    if (!canInviteAs(role, input.role)) {
      throw forbidden(role === "guardian" ? "Guardians can only invite members." : "Only owners and guardians can invite.");
    }
    if (inviteeUid && (data.memberIds as string[]).includes(inviteeUid)) {
      throw new FamilyError(409, "already_member", "That person is already in this family.");
    }
    if ((data.memberIds as string[]).length >= LIMITS.maxMembersPerFamily) {
      throw new FamilyError(409, "member_limit", `A family can have at most ${LIMITS.maxMembersPerFamily} members.`);
    }
    const pending = await tx.get(invitations().where("familyId", "==", familyId).where("status", "==", "pending"));
    const live = pending.docs.filter((d) => ms(d.get("expiresAt")) > Date.now());
    if (live.some((d) => (inviteeEmail && d.get("inviteeEmail") === inviteeEmail) || (inviteePhone && d.get("inviteePhone") === inviteePhone))) {
      throw new FamilyError(409, "already_invited", "There's already a pending invitation for that person.");
    }
    if (live.length >= LIMITS.maxPendingInvitesPerFamily) {
      throw new FamilyError(409, "invite_limit", "Too many pending invitations. Revoke some first.");
    }
    const inviter = await profileName(tx, user.uid, user.displayName);
    tx.create(ref, {
      familyId,
      familyName: data.name,
      invitedBy: user.uid,
      invitedByName: inviter.name,
      inviteeEmail,
      inviteePhone,
      role: input.role,
      status: "pending",
      createdAt: FieldValue.serverTimestamp(),
      expiresAt: Timestamp.fromMillis(Date.now() + LIMITS.inviteTtlMs),
      respondedAt: null,
    });
    if (invitee?.notifiable) {
      queueNotification(
        tx,
        invitee.uid,
        {
          kind: "invitation",
          title: `${inviter.name} invited you to ${data.name}`,
          body: "Open FamilyGuard to accept or decline. Joining never shares your location automatically.",
          link: "/family",
        },
        outbox,
      );
    }
  });
  await outbox.flush();
  return toInvitationView(ref.id, (await ref.get()).data()!);
}

export async function revokeInvitation(user: SessionUser, familyId: string, inviteId: string): Promise<void> {
  await db().runTransaction(async (tx) => {
    const { role } = await loadForMember(tx, familyId, user.uid);
    if (!canManageInvites(role)) throw forbidden();
    const ref = invitations().doc(inviteId);
    const inv = await tx.get(ref);
    if (!inv.exists || inv.get("familyId") !== familyId) throw new FamilyError(404, "not_found", "Invitation not found.");
    if (inv.get("status") !== "pending") throw new FamilyError(409, "not_pending", "This invitation is no longer pending.");
    tx.update(ref, { status: "revoked", respondedAt: FieldValue.serverTimestamp() });
  });
}

function addressedTo(user: SessionUser, inv: DocumentData): boolean {
  const emailMatch = Boolean(inv.inviteeEmail && user.emailVerified && user.email?.toLowerCase() === inv.inviteeEmail);
  const phoneMatch = Boolean(inv.inviteePhone && user.phoneNumber === inv.inviteePhone);
  return emailMatch || phoneMatch;
}

/** Accept or decline. Only the invitee (verified email / phone) can respond. */
export async function respondToInvitation(user: SessionUser, inviteId: string, accept: boolean): Promise<{ familyId: string }> {
  return db().runTransaction(async (tx) => {
    const invRef = invitations().doc(inviteId);
    const inv = await tx.get(invRef);
    const d = inv.data();
    // Someone else's invitation looks exactly like a missing one.
    if (!inv.exists || !d || !addressedTo(user, d)) throw new FamilyError(404, "not_found", "Invitation not found.");
    if (d.status !== "pending") throw new FamilyError(409, "not_pending", "This invitation is no longer pending.");
    if (ms(d.expiresAt) <= Date.now()) {
      throw new FamilyError(410, "expired", "This invitation has expired. Ask for a new one.");
    }

    if (!accept) {
      tx.update(invRef, { status: "rejected", respondedAt: FieldValue.serverTimestamp(), respondedBy: user.uid });
      return { familyId: d.familyId as string };
    }

    const famRef = families().doc(d.familyId);
    const fam = await tx.get(famRef);
    const profile = await profileName(tx, user.uid, user.displayName);
    if (!fam.exists) throw new FamilyError(410, "family_gone", "This family no longer exists.");
    const famData = fam.data()!;
    const memberIds = famData.memberIds as string[];
    if (memberIds.includes(user.uid)) throw new FamilyError(409, "already_member", "You're already in this family.");
    if (memberIds.length >= LIMITS.maxMembersPerFamily) throw new FamilyError(409, "member_limit", "This family is full.");
    if (profile.familyIds.length >= LIMITS.maxFamiliesPerUser) {
      throw new FamilyError(409, "family_limit", `You can belong to at most ${LIMITS.maxFamiliesPerUser} families.`);
    }

    const usedColors = Object.values(famData.members as Record<string, { color: string }>).map((m) => m.color);
    tx.update(famRef, {
      memberIds: FieldValue.arrayUnion(user.uid),
      [`members.${user.uid}`]: {
        uid: user.uid,
        displayName: profile.name,
        role: d.role,
        color: nextMemberColor(usedColors),
        joinedAt: FieldValue.serverTimestamp(),
      },
      updatedAt: FieldValue.serverTimestamp(),
    });
    tx.update(users().doc(user.uid), { familyIds: FieldValue.arrayUnion(d.familyId), updatedAt: FieldValue.serverTimestamp() });
    tx.update(invRef, { status: "accepted", respondedAt: FieldValue.serverTimestamp(), respondedBy: user.uid });
    return { familyId: d.familyId as string };
  });
}

// ── Members ────────────────────────────────────────────────

export async function changeMemberRole(user: SessionUser, familyId: string, targetUid: string, next: FamilyRole) {
  await db().runTransaction(async (tx) => {
    const { ref, data, role } = await loadForMember(tx, familyId, user.uid);
    const target = data.members[targetUid];
    if (!target) throw new FamilyError(404, "not_found", "Member not found.");
    if (!canChangeRole(role, target.role, next, targetUid === user.uid)) throw forbidden("Only the owner can change roles.");
    tx.update(ref, { [`members.${targetUid}.role`]: next, updatedAt: FieldValue.serverTimestamp() });
  });
}

/**
 * Remove a member, or leave (targetUid === actor). Once removed, Firestore
 * rules stop the person reading the family — and family members' locations —
 * immediately, because every read checks the live memberIds list.
 */
export async function removeMember(user: SessionUser, familyId: string, targetUid: string) {
  await db().runTransaction(async (tx) => {
    const { ref, data, role } = await loadForMember(tx, familyId, user.uid);
    const target = data.members[targetUid];
    if (!target) throw new FamilyError(404, "not_found", "Member not found.");
    const self = targetUid === user.uid;
    if (!canRemoveMember(role, target.role, self)) {
      throw forbidden(target.role === "owner" ? "The owner can't leave. Delete the family instead." : undefined);
    }
    const [targetUser, targetLoc] = await Promise.all([tx.get(userRef(targetUid)), tx.get(locRef(targetUid))]);
    tx.update(ref, {
      memberIds: FieldValue.arrayRemove(targetUid),
      [`members.${targetUid}`]: FieldValue.delete(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    tx.update(users().doc(targetUid), { familyIds: FieldValue.arrayRemove(familyId), updatedAt: FieldValue.serverTimestamp() });
    // Their location stops being shared with this family in the same transaction.
    detachFamilyFromSharing(tx, targetUid, familyId, targetUser, targetLoc);
  });
}

/** Keep the denormalised member name in sync after a profile edit. */
export async function syncMemberDisplayName(uid: string, displayName: string): Promise<void> {
  const snap = await families().where("memberIds", "array-contains", uid).get();
  if (snap.empty) return;
  const batch = db().batch();
  for (const doc of snap.docs) batch.update(doc.ref, { [`members.${uid}.displayName`]: displayName });
  await batch.commit();
}
