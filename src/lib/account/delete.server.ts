import "server-only";
import { FieldValue, type Query } from "firebase-admin/firestore";
import { adminAuth, adminDb } from "@/lib/firebase/admin";
import type { SessionUser } from "@/lib/auth/session";
import { deleteFamily, listMyFamilies, removeMember } from "@/lib/families/service.server";
import { deleteMyHistory, stopSharing } from "@/lib/location/service.server";
import { PushOutbox } from "@/lib/notifications/push.server";
import { queueNotification } from "@/lib/notifications/service.server";
import { logSecurityEvent } from "@/lib/security/events.server";
import type { FamilyRole } from "@/types/models";

/*
 * Account deletion — removes everything that is the user's, keeps families
 * working for everyone else. Every step is idempotent, so a failure part-way
 * can simply be retried (the Auth account is deleted LAST, so the user can
 * still sign in and retry).
 */

const db = () => adminDb();

/** Delete every doc matching a query, in batches. */
async function deleteAll(q: Query): Promise<number> {
  let n = 0;
  for (;;) {
    const snap = await q.limit(400).get();
    if (snap.empty) return n;
    const batch = db().batch();
    snap.docs.forEach((d) => batch.delete(d.ref));
    await batch.commit();
    n += snap.size;
  }
}

/** Remove only the user's LOCATION data: live location (sharing off) + all history. */
export async function deleteAllLocationData(uid: string, ip?: string | null): Promise<{ historyDeleted: number }> {
  await stopSharing(uid);
  const historyDeleted = await deleteMyHistory(uid);
  void logSecurityEvent("location_data_deleted", { uid, ip });
  return { historyDeleted };
}

const RANK: Record<FamilyRole, number> = { owner: 0, guardian: 1, member: 2 };

/** Hand a family to its longest-standing guardian (else member), atomically. */
async function transferOwnershipAndLeave(familyId: string, uid: string, displayName: string) {
  const ref = db().collection("families").doc(familyId);
  const outbox = new PushOutbox();
  await db().runTransaction(async (tx) => {
    outbox.reset();
    const snap = await tx.get(ref);
    if (!snap.exists) return;
    const members = Object.values(snap.get("members") as Record<string, { uid: string; role: FamilyRole; joinedAt: FirebaseFirestore.Timestamp }>)
      .filter((m) => m.uid !== uid)
      .sort((a, b) => RANK[a.role] - RANK[b.role] || a.joinedAt.toMillis() - b.joinedAt.toMillis());
    const heir = members[0];
    if (!heir) return;
    tx.update(ref, {
      ownerId: heir.uid,
      [`members.${heir.uid}.role`]: "owner",
      memberIds: FieldValue.arrayRemove(uid),
      [`members.${uid}`]: FieldValue.delete(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    queueNotification(
      tx,
      heir.uid,
      {
        kind: "invitation",
        title: `You're now the owner of ${snap.get("name")}`,
        body: `${displayName} deleted their FamilyGuard account and ownership passed to you.`,
        link: `/family/${familyId}`,
      },
      outbox,
    );
  });
  await outbox.flush();
}

export async function deleteAccount(user: SessionUser, ip?: string | null): Promise<void> {
  const uid = user.uid;
  const profile = await db().collection("users").doc(uid).get();
  const displayName = (profile.get("displayName") as string | undefined) ?? user.displayName;

  // 1. Location: sharing off (live location deleted) + full history.
  await stopSharing(uid);
  await deleteMyHistory(uid);

  // 2. Families: leave, hand over ownership, or delete when no one else is left.
  for (const f of await listMyFamilies(uid)) {
    if (f.myRole !== "owner") await removeMember(user, f.id, uid);
    else if (f.members.length > 1) await transferOwnershipAndLeave(f.id, uid, displayName);
    else await deleteFamily(user, f.id);
  }

  // Steps 3–7 touch disjoint data, so they run in parallel (fewer round trips).
  // The profile and sign-in account are deleted only after all of them succeed,
  // so a failure leaves an account that can retry the (idempotent) deletion.
  const inv = db().collection("familyInvitations");
  await Promise.all([
    // 3. Invitations. Those she SENT stay as the family's records but are revoked
    //    if pending and anonymised; those addressed TO her (her email/phone) and
    //    any she responded to are deleted outright.
    (async () => {
      const sent = await inv.where("invitedBy", "==", uid).get();
      await Promise.all(
        sent.docs.map((d) =>
          d.ref.update({
            invitedBy: null,
            invitedByName: "Deleted user",
            ...(d.get("status") === "pending" ? { status: "revoked", respondedAt: FieldValue.serverTimestamp() } : {}),
          }),
        ),
      );
      await deleteAll(inv.where("respondedBy", "==", uid));
      if (user.email) await deleteAll(inv.where("inviteeEmail", "==", user.email.toLowerCase()));
      if (user.phoneNumber) await deleteAll(inv.where("inviteePhone", "==", user.phoneNumber));
    })(),
    // 4. SOS: delete alerts the user sent; remove their acknowledgements from others'.
    (async () => {
      await deleteAll(db().collection("emergencyAlerts").where("uid", "==", uid));
      const acked = await db().collection("emergencyAlerts").where("acknowledgedByIds", "array-contains", uid).get();
      await Promise.all(
        acked.docs.map((d) => {
          const list = ((d.get("acknowledgedBy") as { uid: string }[] | undefined) ?? []).filter((a) => a.uid !== uid);
          return d.ref.update({ acknowledgedBy: list, acknowledgedByIds: FieldValue.arrayRemove(uid) });
        }),
      );
    })(),
    // 5. Family activity entries about the user.
    deleteAll(db().collectionGroup("events").where("uid", "==", uid)),
    // 6. Safe zones they created stay with the family, without the link to them.
    (async () => {
      const zones = await db().collection("geofences").where("createdBy", "==", uid).get();
      await Promise.all(zones.docs.map((z) => z.ref.update({ createdBy: null })));
    })(),
    // 7. Inbox, devices (incl. push tokens).
    (async () => {
      await deleteAll(db().collection("notifications").doc(uid).collection("items"));
      await db().collection("notifications").doc(uid).delete();
    })(),
    deleteAll(db().collection("devices").where("ownerId", "==", uid)),
  ]);

  // Profile.
  await db().collection("users").doc(uid).delete();

  // 8. Last: end all sessions and delete the sign-in account itself.
  await adminAuth().revokeRefreshTokens(uid).catch(() => undefined);
  await adminAuth().deleteUser(uid).catch((e) => {
    if ((e as { code?: string }).code !== "auth/user-not-found") throw e;
  });
  void logSecurityEvent("account_deleted", { uid, ip });
}
