import { FieldValue } from "firebase-admin/firestore";
import { authed } from "@/lib/api/handler";
import { adminDb } from "@/lib/firebase/admin";
import { prefsFromDoc, prefsSchema } from "@/lib/notifications/prefs";

export const runtime = "nodejs";

const userRef = (uid: string) => adminDb().collection("users").doc(uid);

export const GET = authed(async ({ user }) => ({ prefs: prefsFromDoc((await userRef(user.uid).get()).get("notificationPrefs")) }));

export const PUT = authed(async ({ user, body }) => {
  const prefs = await body(prefsSchema);
  await userRef(user.uid).update({ notificationPrefs: prefs, updatedAt: FieldValue.serverTimestamp() });
  return { prefs };
});
