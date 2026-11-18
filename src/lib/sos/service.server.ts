import "server-only";
import { FieldValue, Timestamp, type DocumentData } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import type { SessionUser } from "@/lib/auth/session";
import { isMissingIndexError } from "@/lib/firestore/indexes";
import { FamilyError } from "@/lib/families/errors";
import { queueFamilyEvent } from "@/lib/families/events.server";
import { PushOutbox } from "@/lib/notifications/push.server";
import { queueNotification } from "@/lib/notifications/service.server";
import { createGlobalRateLimiter } from "@/lib/security/rate-limit.server";
import type { AlertStatus } from "@/types/models";
import { SOS_LIMITS, type EmergencySettings, type SendSos } from "./validation";

/*
 * emergencyAlerts/{id}
 *  - Created ONLY by an explicit user action (POST /api/sos after a
 *    confirmation step in the UI). Nothing in the system sends one on its own.
 *  - Recipients: current members of the families the sender chose.
 *  - The location on an alert is a one-time snapshot the sender chose to
 *    include; it does not turn on location sharing.
 */

const db = () => adminDb();
const alerts = () => db().collection("emergencyAlerts");
const userRef = (uid: string) => db().collection("users").doc(uid);
const familyRef = (id: string) => db().collection("families").doc(id);
const ms = (v: unknown) => (v instanceof Timestamp ? v.toMillis() : typeof v === "number" ? v : 0);

/** Per-user SOS budget: generous for a real emergency, stops accidental floods. */
const sosLimiter = createGlobalRateLimiter({ name: "sos", limit: SOS_LIMITS.maxPerWindow, windowMs: SOS_LIMITS.windowMs });

export interface SosView {
  id: string;
  uid: string;
  displayName: string;
  familyIds: string[];
  familyNames: string[];
  location: { lat: number; lng: number; accuracy: number } | null;
  message: string;
  status: AlertStatus;
  acknowledgedBy: { uid: string; displayName: string; at: number }[];
  recipientCount: number;
  createdAt: number;
  resolvedAt: number | null;
  resolvedByName: string | null;
}

function toView(id: string, d: DocumentData): SosView {
  return {
    id,
    uid: d.uid,
    displayName: d.displayName,
    familyIds: d.familyIds ?? [],
    familyNames: d.familyNames ?? [],
    location: d.lat != null ? { lat: d.lat, lng: d.lng, accuracy: d.accuracy } : null,
    message: d.message ?? "",
    status: d.status,
    acknowledgedBy: (d.acknowledgedBy ?? []).map((a: DocumentData) => ({ uid: a.uid, displayName: a.displayName, at: ms(a.at) })),
    recipientCount: d.recipientCount ?? 0,
    createdAt: ms(d.createdAt),
    resolvedAt: d.resolvedAt ? ms(d.resolvedAt) : null,
    resolvedByName: d.resolvedByName ?? null,
  };
}

async function myProfile(uid: string) {
  const snap = await userRef(uid).get();
  if (!snap.exists) throw new FamilyError(409, "no_profile", "Your profile isn't set up yet. Sign in again.");
  return { familyIds: (snap.get("familyIds") as string[] | undefined) ?? [], displayName: (snap.get("displayName") as string) ?? "A family member" };
}

/** Can `uid` see/act on this alert as a recipient? (Current member of one of its families.) */
function isRecipient(alert: DocumentData, myFamilyIds: string[]) {
  return (alert.familyIds as string[]).some((f) => myFamilyIds.includes(f));
}

// ── Send ───────────────────────────────────────────────────

export async function sendSos(user: SessionUser, input: SendSos): Promise<{ alert: SosView; duplicate: boolean }> {
  const me = await myProfile(user.uid);
  if (me.familyIds.length === 0) throw new FamilyError(409, "no_family", "Join or create a family before using SOS.");
  const familyIds = [...new Set(input.familyIds ?? me.familyIds)];
  if (familyIds.some((f) => !me.familyIds.includes(f))) {
    throw new FamilyError(403, "not_a_member", "You can only alert families you belong to.");
  }

  // If an SOS is already active, update it rather than spawning duplicates.
  const existing = await alerts().where("uid", "==", user.uid).where("status", "==", "active").limit(1).get();
  if (!existing.empty) {
    const doc = existing.docs[0]!;
    if (input.location) {
      await doc.ref.update({ lat: input.location.lat, lng: input.location.lng, accuracy: input.location.accuracy, locationUpdatedAt: FieldValue.serverTimestamp() });
    }
    return { alert: toView(doc.id, (await doc.ref.get()).data()!), duplicate: true };
  }

  const rl = await sosLimiter(user.uid);
  if (!rl.ok) {
    throw new FamilyError(429, "rate_limited", `Too many SOS alerts. If you're in danger, call your local emergency number now.`);
  }

  const ref = alerts().doc();
  const outbox = new PushOutbox();
  await db().runTransaction(async (tx) => {
    outbox.reset();
    const fams = await Promise.all(familyIds.map((f) => tx.get(familyRef(f))));
    const recipients = new Set<string>();
    const familyNames: string[] = [];
    for (const f of fams) {
      const d = f.data();
      if (!f.exists || !d || !(d.memberIds as string[]).includes(user.uid)) {
        throw new FamilyError(403, "not_a_member", "You can only alert families you belong to.");
      }
      familyNames.push(d.name);
      (d.memberIds as string[]).filter((u) => u !== user.uid).forEach((u) => recipients.add(u));
    }

    tx.create(ref, {
      uid: user.uid,
      displayName: me.displayName,
      familyIds,
      familyNames,
      lat: input.location?.lat ?? null,
      lng: input.location?.lng ?? null,
      accuracy: input.location?.accuracy ?? null,
      message: input.message ?? "",
      status: "active",
      acknowledgedBy: [],
      acknowledgedByIds: [],
      recipientCount: recipients.size,
      createdAt: FieldValue.serverTimestamp(),
      resolvedAt: null,
    });
    const where = input.location ? " Their location is attached." : "";
    for (const uid of recipients) {
      queueNotification(tx, uid, {
        kind: "sos",
        priority: "critical",
        title: `🚨 SOS from ${me.displayName}`,
        body: `${input.message ? `“${input.message}” ` : ""}${me.displayName} needs help.${where}`,
        link: `/sos?alert=${ref.id}`,
      }, outbox);
    }
    for (const f of familyIds) queueFamilyEvent(tx, f, { type: "sos", uid: user.uid, displayName: me.displayName, refId: ref.id });
  });
  await outbox.flush();

  return { alert: toView(ref.id, (await ref.get()).data()!), duplicate: false };
}

// ── Respond ────────────────────────────────────────────────

/** A recipient confirms they've seen the alert. The sender is notified. */
export async function acknowledgeSos(user: SessionUser, alertId: string): Promise<SosView> {
  const me = await myProfile(user.uid);
  const ref = alerts().doc(alertId);
  const outbox = new PushOutbox();
  await db().runTransaction(async (tx) => {
    outbox.reset();
    const snap = await tx.get(ref);
    const d = snap.data();
    if (!snap.exists || !d || !isRecipient(d, me.familyIds) || d.uid === user.uid) {
      throw new FamilyError(404, "not_found", "Alert not found.");
    }
    if (d.status !== "active") throw new FamilyError(409, "not_active", "This alert is no longer active.");
    if ((d.acknowledgedBy as { uid: string }[]).some((a) => a.uid === user.uid)) return;
    tx.update(ref, {
      acknowledgedBy: FieldValue.arrayUnion({ uid: user.uid, displayName: me.displayName, at: Timestamp.now() }),
      // Queryable list of who acknowledged (used e.g. to erase a deleted account's acknowledgements).
      acknowledgedByIds: FieldValue.arrayUnion(user.uid),
    });
    queueNotification(tx, d.uid, {
      kind: "sos",
      title: `${me.displayName} saw your SOS`,
      body: "They've acknowledged your alert.",
      link: `/sos?alert=${alertId}`,
    }, outbox);
  });
  await outbox.flush();
  return toView(alertId, (await ref.get()).data()!);
}

/**
 * End an alert. The sender can mark it resolved ("I'm safe") or cancelled
 * (false alarm); a family owner/guardian can mark it resolved.
 */
export async function resolveSos(user: SessionUser, alertId: string, outcome: "resolved" | "cancelled"): Promise<SosView> {
  const me = await myProfile(user.uid);
  const ref = alerts().doc(alertId);
  const outbox = new PushOutbox();
  await db().runTransaction(async (tx) => {
    outbox.reset();
    const snap = await tx.get(ref);
    const d = snap.data();
    const isSender = d?.uid === user.uid;
    if (!snap.exists || !d || (!isSender && !isRecipient(d, me.familyIds))) throw new FamilyError(404, "not_found", "Alert not found.");
    if (d.status !== "active") throw new FamilyError(409, "not_active", "This alert is no longer active.");

    const fams = await Promise.all((d.familyIds as string[]).map((f) => tx.get(familyRef(f))));
    if (!isSender) {
      if (outcome === "cancelled") throw new FamilyError(403, "forbidden", "Only the sender can cancel an alert.");
      const manager = fams.some((f) => ["owner", "guardian"].includes(f.get(`members.${user.uid}.role`)));
      if (!manager) throw new FamilyError(403, "forbidden", "Only the sender or a family owner/guardian can resolve an alert.");
    }

    tx.update(ref, { status: outcome, resolvedAt: FieldValue.serverTimestamp(), resolvedBy: user.uid, resolvedByName: me.displayName });
    const recipients = new Set<string>();
    fams.forEach((f) => ((f.get("memberIds") as string[] | undefined) ?? []).forEach((u) => recipients.add(u)));
    recipients.delete(user.uid);
    for (const uid of recipients) {
      queueNotification(tx, uid, {
        kind: "sos",
        title: outcome === "cancelled" ? `${d.displayName} cancelled their SOS` : `${d.displayName}'s SOS was resolved`,
        body: outcome === "cancelled" ? "It was a false alarm." : isSender ? `${d.displayName} says they're safe.` : `Marked resolved by ${me.displayName}.`,
        link: `/sos?alert=${alertId}`,
      }, outbox);
    }
    for (const f of d.familyIds as string[]) {
      queueFamilyEvent(tx, f, {
        type: outcome === "cancelled" ? "sos_cancelled" : "sos_resolved",
        uid: d.uid,
        displayName: d.displayName,
        refId: alertId,
      });
    }
  });
  await outbox.flush();
  return toView(alertId, (await ref.get()).data()!);
}

// ── Read ───────────────────────────────────────────────────

/**
 * Alerts the user may see: their own, plus those sent to families they
 * CURRENTLY belong to. Newest first.
 */
export async function listSosForUser(uid: string, limit = 50): Promise<SosView[]> {
  const me = await myProfile(uid);
  const families = me.familyIds.slice(0, 30);
  const own = alerts().where("uid", "==", uid);
  const shared = families.length ? alerts().where("familyIds", "array-contains-any", families) : null;
  let snaps;
  try {
    // Fast path: newest first, served by the composite indexes in firestore.indexes.json.
    snaps = await Promise.all(
      [own, shared].filter((q) => q !== null).map((q) => q.orderBy("createdAt", "desc").limit(limit).get()),
    );
  } catch (e) {
    if (!isMissingIndexError(e)) throw e;
    // Indexes not deployed/built yet: plain filters need none. Read a bounded
    // set and sort here; per-user and per-family alert counts are small.
    console.warn("[sos] composite index missing; using unsorted fallback query");
    snaps = await Promise.all([own, shared].filter((q) => q !== null).map((q) => q.limit(FALLBACK_SCAN).get()));
  }
  const seen = new Set<string>();
  return snaps
    .flatMap((s) => s.docs)
    .filter((d) => !seen.has(d.id) && seen.add(d.id))
    .map((d) => toView(d.id, d.data()))
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, limit);
}

/** Upper bound on alerts read per query when the sorted index is unavailable. */
const FALLBACK_SCAN = 500;

export async function getSosForUser(uid: string, alertId: string): Promise<SosView> {
  const me = await myProfile(uid);
  const snap = await alerts().doc(alertId).get();
  const d = snap.data();
  if (!snap.exists || !d || (d.uid !== uid && !isRecipient(d, me.familyIds))) throw new FamilyError(404, "not_found", "Alert not found.");
  return toView(snap.id, d);
}

// ── Emergency contacts (stored on the user's profile, server-written) ──

export type EmergencySettingsView = EmergencySettings;

export async function getEmergencySettings(uid: string): Promise<EmergencySettingsView> {
  const snap = await userRef(uid).get();
  const e = snap.get("emergency") as Partial<EmergencySettings> | undefined;
  return { contacts: e?.contacts ?? [], emergencyNumber: e?.emergencyNumber ?? "112" };
}

export async function saveEmergencySettings(uid: string, settings: EmergencySettings): Promise<EmergencySettingsView> {
  await userRef(uid).update({ emergency: settings, updatedAt: FieldValue.serverTimestamp() });
  return getEmergencySettings(uid);
}
