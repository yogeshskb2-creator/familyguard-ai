import "server-only";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { adminAuth, adminDb } from "@/lib/firebase/admin";
import { syncMemberDisplayName } from "@/lib/families/service.server";
import type { SessionUser } from "@/lib/auth/session";
import type { ProfileUpdate } from "@/lib/validation/auth";
import { NO_CONSENT, consentFromDoc } from "@/lib/location/consent";
import type { UserProfile } from "@/types/models";

const users = () => adminDb().collection("users");

function toMillis(v: unknown): number {
  return v instanceof Timestamp ? v.toMillis() : typeof v === "number" ? v : 0;
}

export function profileFromDoc(uid: string, d: FirebaseFirestore.DocumentData): UserProfile {
  return {
    uid,
    displayName: d.displayName ?? "Member",
    email: d.email ?? null,
    phoneNumber: d.phoneNumber ?? null,
    photoURL: d.photoURL ?? null,
    familyIds: Array.isArray(d.familyIds) ? d.familyIds : [],
    aiProvider: d.aiProvider ?? "claude",
    sharing: consentFromDoc(d.sharing),
    createdAt: toMillis(d.createdAt),
    updatedAt: toMillis(d.updatedAt),
  };
}

/**
 * Create the profile on first sign-in, or refresh identity fields that come
 * from the auth provider. Only the server writes these fields; the client
 * can never set uid, familyIds, role or admin flags.
 */
export async function ensureUserProfile(user: SessionUser): Promise<UserProfile> {
  const ref = users().doc(user.uid);
  await adminDb().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const identity = { email: user.email, phoneNumber: user.phoneNumber, photoURL: user.photoURL };
    if (!snap.exists) {
      tx.create(ref, {
        uid: user.uid,
        displayName: user.displayName.slice(0, 60),
        ...identity,
        familyIds: [],
        aiProvider: "claude",
        sharing: NO_CONSENT,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
    } else {
      tx.update(ref, { ...identity, updatedAt: FieldValue.serverTimestamp() });
    }
  });
  const snap = await ref.get();
  return profileFromDoc(user.uid, snap.data()!);
}

export async function getUserProfile(uid: string): Promise<UserProfile | null> {
  const snap = await users().doc(uid).get();
  return snap.exists ? profileFromDoc(uid, snap.data()!) : null;
}

/** `update` must already be validated with profileUpdateSchema (whitelisted keys). */
export async function updateUserProfile(uid: string, update: ProfileUpdate): Promise<UserProfile> {
  await users().doc(uid).update({ ...update, updatedAt: FieldValue.serverTimestamp() });
  if (update.displayName) {
    await adminAuth().updateUser(uid, { displayName: update.displayName });
    await syncMemberDisplayName(uid, update.displayName);
  }
  return (await getUserProfile(uid))!;
}
