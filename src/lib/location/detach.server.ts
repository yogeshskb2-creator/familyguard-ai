import "server-only";
import { FieldValue, type DocumentSnapshot, type Transaction } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import { consentFromDoc } from "./consent";

export const userRef = (uid: string) => adminDb().collection("users").doc(uid);
export const locRef = (uid: string) => adminDb().collection("locations").doc(uid);

/**
 * Called by the families service (inside its transaction) when a user leaves
 * or is removed from a family, or the family is deleted. Reads must be done
 * by the caller beforehand (Firestore: all reads before writes).
 */
export function detachFamilyFromSharing(
  tx: Transaction,
  uid: string,
  familyId: string,
  userSnap: DocumentSnapshot,
  locSnap: DocumentSnapshot,
) {
  const consent = consentFromDoc(userSnap.get("sharing"));
  const remaining = consent.familyIds.filter((f) => f !== familyId);
  if (consent.active && remaining.length === 0) {
    // Nobody left to share with → sharing stops entirely.
    tx.update(userRef(uid), {
      "sharing.active": false,
      "sharing.familyIds": [],
      "sharing.revokedAt": FieldValue.serverTimestamp(),
    });
    if (locSnap.exists) tx.delete(locRef(uid));
    return;
  }
  if (consent.familyIds.includes(familyId)) tx.update(userRef(uid), { "sharing.familyIds": remaining });
  if (locSnap.exists) tx.update(locRef(uid), { sharedWith: FieldValue.arrayRemove(familyId) });
}
