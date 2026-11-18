import "server-only";
import { FieldValue, Timestamp, type DocumentReference } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import type { AppNotification, NotificationKind } from "@/types/models";
import type { PushOutbox } from "./push.server";

/*
 * notifications/{uid}/items/{id} — per-user inbox, written only by the server.
 * Owners may read their inbox and flip `read` (see firestore.rules).
 * Push delivery (FCM) is layered on in Phase 8.
 */

/** Anything that can create a doc: a Transaction or a WriteBatch. */
interface Writer {
  create(ref: DocumentReference, data: FirebaseFirestore.WithFieldValue<FirebaseFirestore.DocumentData>): unknown;
}

const inbox = (uid: string) => adminDb().collection("notifications").doc(uid).collection("items");
const ms = (v: unknown) => (v instanceof Timestamp ? v.toMillis() : 0);

export interface NewNotification {
  kind: NotificationKind;
  title: string;
  body: string;
  link: string | null;
  /** Critical notifications (SOS) are styled and surfaced prominently. */
  priority?: "normal" | "critical";
}

/**
 * Write an in-app notification inside the caller's transaction/batch and, if
 * an outbox is given, schedule a push for AFTER the commit (see push.server).
 */
export function queueNotification(w: Writer, uid: string, n: NewNotification, outbox?: PushOutbox) {
  w.create(inbox(uid).doc(), { ...n, priority: n.priority ?? "normal", read: false, createdAt: FieldValue.serverTimestamp() });
  outbox?.add(uid, n);
}

export async function listNotifications(uid: string, limit = 50): Promise<(AppNotification & { priority: string })[]> {
  const snap = await inbox(uid).orderBy("createdAt", "desc").limit(limit).get();
  return snap.docs.map((d) => ({
    id: d.id,
    kind: d.get("kind"),
    title: d.get("title"),
    body: d.get("body"),
    link: d.get("link") ?? null,
    read: d.get("read") === true,
    priority: d.get("priority") ?? "normal",
    createdAt: ms(d.get("createdAt")),
  }));
}

export async function unreadCount(uid: string): Promise<number> {
  const agg = await inbox(uid).where("read", "==", false).count().get();
  return agg.data().count;
}

/** Mark specific notifications (or all) as read — only ever in the caller's own inbox. */
export async function markRead(uid: string, ids: string[] | "all"): Promise<number> {
  const docs =
    ids === "all"
      ? (await inbox(uid).where("read", "==", false).limit(500).get()).docs.map((d) => d.ref)
      : ids.map((id) => inbox(uid).doc(id));
  if (docs.length === 0) return 0;
  const batch = adminDb().batch();
  // update() fails for ids not in this user's inbox, so nobody can touch another inbox.
  docs.forEach((ref) => batch.update(ref, { read: true }));
  await batch.commit();
  return docs.length;
}
