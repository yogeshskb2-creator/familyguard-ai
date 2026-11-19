import "server-only";
import { FieldValue, Timestamp, type DocumentData, type Transaction } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import type { SessionUser } from "@/lib/auth/session";
import { FamilyError, forbidden } from "@/lib/families/errors";
import { queueFamilyEvent } from "@/lib/families/events.server";
import { canManageInvites } from "@/lib/families/permissions";
import { getFamilyForMember } from "@/lib/families/service.server";
import type { PushOutbox } from "@/lib/notifications/push.server";
import { queueNotification } from "@/lib/notifications/service.server";
import { distanceMeters } from "@/lib/location/geo";
import type { FamilyRole, Geofence, ZoneAlarm } from "@/types/models";
import type { CreateZoneInput } from "./validation";
import { ZONE_LIMITS, formatRadius, nextZoneState, watches } from "./zones";

/*
 * geofences/{zoneId} — safe zones belonging to ONE family.
 *  - Members can view a family's zones; owners/guardians manage them.
 *  - Zones are evaluated server-side, only against location updates a person
 *    has consented to share WITH THAT FAMILY (see evaluateZonesInTx).
 */

const zones = () => adminDb().collection("geofences");
/*
 * zoneAlarms/{alarmId} — raised when someone leaves a zone with alarmOnExit.
 * Server-only (no client rules). `openFor` lists the owners/guardians who
 * still have to see it; it empties when they acknowledge or when the person
 * is back inside (active = false).
 */
const alarms = () => adminDb().collection("zoneAlarms");
const ms = (v: unknown) => (v instanceof Timestamp ? v.toMillis() : 0);

function toZone(id: string, d: DocumentData): Geofence {
  return {
    id,
    familyId: d.familyId,
    createdBy: d.createdBy,
    name: d.name,
    kind: d.kind,
    lat: d.lat,
    lng: d.lng,
    radius: d.radius,
    alertsEnabled: d.alertsEnabled,
    notifyOnEnter: d.notifyOnEnter,
    notifyOnExit: d.notifyOnExit,
    alarmOnExit: d.alarmOnExit === true,
    watchUids: Array.isArray(d.watchUids) ? (d.watchUids as string[]) : [],
    createdAt: ms(d.createdAt),
  };
}

function assertWatchable(watchUids: string[] | undefined, memberUids: string[]) {
  if (watchUids?.some((u) => !memberUids.includes(u))) {
    throw new FamilyError(400, "not_member", "You can only choose people who are in this family.");
  }
}

const manageable = canManageInvites; // owner or guardian

export async function listZones(familyId: string, viewerUid: string): Promise<Geofence[]> {
  await getFamilyForMember(familyId, viewerUid); // 404 for non-members
  const snap = await zones().where("familyId", "==", familyId).get();
  return snap.docs.map((d) => toZone(d.id, d.data())).sort((a, b) => a.createdAt - b.createdAt);
}

export async function createZone(user: SessionUser, familyId: string, input: CreateZoneInput): Promise<Geofence> {
  const family = await getFamilyForMember(familyId, user.uid);
  if (!manageable(family.myRole)) throw forbidden("Only owners and guardians can create safe zones.");
  assertWatchable(input.watchUids, family.members.map((m) => m.uid));
  const existing = await zones().where("familyId", "==", familyId).count().get();
  if (existing.data().count >= ZONE_LIMITS.maxZonesPerFamily) {
    throw new FamilyError(409, "zone_limit", `A family can have at most ${ZONE_LIMITS.maxZonesPerFamily} safe zones.`);
  }
  const ref = zones().doc();
  await ref.create({
    ...input,
    alarmOnExit: input.alarmOnExit ?? false,
    watchUids: input.watchUids ?? [],
    familyId,
    createdBy: user.uid,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });
  return toZone(ref.id, (await ref.get()).data()!);
}

async function loadManageable(user: SessionUser, familyId: string, zoneId: string) {
  const family = await getFamilyForMember(familyId, user.uid);
  const ref = zones().doc(zoneId);
  const snap = await ref.get();
  if (!snap.exists || snap.get("familyId") !== familyId) throw new FamilyError(404, "not_found", "Safe zone not found.");
  if (!manageable(family.myRole)) throw forbidden("Only owners and guardians can change safe zones.");
  return { ref, family };
}

export async function updateZone(user: SessionUser, familyId: string, zoneId: string, input: Partial<CreateZoneInput>): Promise<Geofence> {
  const { ref, family } = await loadManageable(user, familyId, zoneId);
  assertWatchable(input.watchUids, family.members.map((m) => m.uid));
  await ref.update({ ...input, updatedAt: FieldValue.serverTimestamp() });
  // Turning the alarm off (or the zone's alerts) silences alarms already ringing for it.
  if (input.alarmOnExit === false || input.alertsEnabled === false) await closeAlarmsForZone(zoneId);
  return toZone(ref.id, (await ref.get()).data()!);
}

export async function deleteZone(user: SessionUser, familyId: string, zoneId: string): Promise<void> {
  const { ref } = await loadManageable(user, familyId, zoneId);
  await ref.delete();
  await closeAlarmsForZone(zoneId);
}

async function closeAlarmsForZone(zoneId: string) {
  const open = await alarms().where("zoneId", "==", zoneId).where("active", "==", true).get();
  if (open.empty) return;
  const batch = adminDb().batch();
  open.docs.forEach((d) => batch.update(d.ref, { active: false, openFor: [], resolvedAt: FieldValue.serverTimestamp(), resolution: "zone_changed" }));
  await batch.commit();
}

// ── Alarms ─────────────────────────────────────────────────

function toAlarm(id: string, d: DocumentData): ZoneAlarm {
  return {
    id,
    familyId: d.familyId,
    familyName: d.familyName,
    zoneId: d.zoneId,
    zoneName: d.zoneName,
    uid: d.uid,
    displayName: d.displayName,
    lat: d.lat,
    lng: d.lng,
    distanceM: d.distanceM,
    radius: d.radius,
    createdAt: ms(d.createdAt),
    active: d.active === true,
    acknowledgedBy: ((d.acknowledgedBy ?? []) as { uid: string; displayName: string; at: unknown }[]).map((a) => ({
      uid: a.uid,
      displayName: a.displayName,
      at: ms(a.at),
    })),
  };
}

/** Alarms this user still has to see (they are an owner/guardian of that family). */
export async function listMyZoneAlarms(uid: string): Promise<ZoneAlarm[]> {
  const snap = await alarms().where("openFor", "array-contains", uid).limit(20).get();
  return snap.docs.map((d) => toAlarm(d.id, d.data())).sort((a, b) => b.createdAt - a.createdAt);
}

/** "I've seen this": stops the alarm for this user; others keep theirs until they see it too. */
export async function acknowledgeZoneAlarm(user: SessionUser, alarmId: string): Promise<void> {
  await adminDb().runTransaction(async (tx) => {
    const ref = alarms().doc(alarmId);
    const snap = await tx.get(ref);
    const recipients = (snap.get("recipients") as string[] | undefined) ?? [];
    if (!snap.exists || !recipients.includes(user.uid)) throw new FamilyError(404, "not_found", "Alarm not found.");
    const me = await tx.get(adminDb().collection("users").doc(user.uid));
    tx.update(ref, {
      openFor: FieldValue.arrayRemove(user.uid),
      acknowledgedBy: FieldValue.arrayUnion({
        uid: user.uid,
        displayName: (me.get("displayName") as string | undefined) ?? user.displayName,
        at: Timestamp.now(),
      }),
    });
  });
}

export async function countZones(familyIds: string[]): Promise<number> {
  if (familyIds.length === 0) return 0;
  const agg = await zones().where("familyId", "in", familyIds.slice(0, 30)).count().get();
  return agg.data().count;
}

// ── Evaluation (called from recordLocation's transaction) ─────────

export interface ZoneEvalContext {
  zones: Geofence[];
  /** familyId → { name, memberIds, managers } for notification fan-out. */
  families: Map<string, { name: string; memberIds: string[]; managers: string[] }>;
  /** zoneId → id of this person's alarm that is still ringing for that zone. */
  openAlarms: Map<string, string>;
}

/** READ phase: load zones, family members and this person's open alarms for the families the fix is shared with. */
export async function loadZoneContext(tx: Transaction, sharedWith: string[], subjectUid?: string): Promise<ZoneEvalContext> {
  if (sharedWith.length === 0) return { zones: [], families: new Map(), openAlarms: new Map() };
  const [zoneSnap, alarmSnap, ...famSnaps] = await Promise.all([
    tx.get(zones().where("familyId", "in", sharedWith)),
    subjectUid ? tx.get(alarms().where("uid", "==", subjectUid).where("active", "==", true)) : Promise.resolve(null),
    ...sharedWith.map((f) => tx.get(adminDb().collection("families").doc(f))),
  ]);
  const families: ZoneEvalContext["families"] = new Map();
  famSnaps.forEach((s, i) => {
    if (!s.exists) return;
    const members = (s.get("members") ?? {}) as Record<string, { role?: FamilyRole }>;
    const managers = Object.entries(members)
      .filter(([, m]) => m.role === "owner" || m.role === "guardian")
      .map(([uid]) => uid);
    families.set(sharedWith[i]!, { name: s.get("name"), memberIds: s.get("memberIds") ?? [], managers });
  });
  const openAlarms = new Map<string, string>();
  alarmSnap?.docs.forEach((d) => openAlarms.set(d.get("zoneId") as string, d.id));
  return { zones: zoneSnap.docs.map((d) => toZone(d.id, d.data())), families, openAlarms };
}

/**
 * WRITE phase: compute enter/exit transitions for this fix, queue family
 * events + notifications, and return the new per-zone state to store on the
 * location document. Zones of families the person is NOT sharing with are
 * never evaluated (they aren't loaded).
 */
export function applyZoneTransitions(
  tx: Transaction,
  ctx: ZoneEvalContext,
  subject: { uid: string; displayName: string },
  prevState: Record<string, boolean>,
  fix: { lat: number; lng: number; accuracy: number },
  outbox?: PushOutbox,
): { state: Record<string, boolean>; events: { zoneId: string; event: "enter" | "exit" }[] } {
  const state: Record<string, boolean> = {};
  const fired: { zoneId: string; event: "enter" | "exit" }[] = [];
  for (const z of ctx.zones) {
    // Zones watching only certain members don't track anyone else at all.
    if (!watches(z, subject.uid)) continue;
    const { inside, event } = nextZoneState(prevState[z.id], z, fix);
    if (inside !== undefined) state[z.id] = inside;

    // Back inside: the alarm for this zone stops ringing for everyone.
    const openAlarm = ctx.openAlarms.get(z.id);
    if (openAlarm && inside === true) {
      tx.update(alarms().doc(openAlarm), { active: false, openFor: [], resolvedAt: FieldValue.serverTimestamp(), resolution: "returned" });
    }

    if (!event) continue;
    fired.push({ zoneId: z.id, event });
    const fam = ctx.families.get(z.familyId);
    if (!fam) continue;
    queueFamilyEvent(tx, z.familyId, {
      type: event === "enter" ? "geofence_enter" : "geofence_exit",
      uid: subject.uid,
      displayName: subject.displayName,
      zoneName: z.name,
      refId: z.id,
    });
    if (!z.alertsEnabled) continue;

    const others = fam.memberIds.filter((uid) => uid !== subject.uid);
    const link = `/map?family=${z.familyId}`;

    if (event === "exit" && z.alarmOnExit) {
      const distanceM = Math.round(distanceMeters(z, fix));
      const away = formatRadius(Math.max(0, distanceM));
      const alarmFor = fam.managers.filter((uid) => uid !== subject.uid);
      if (!openAlarm && alarmFor.length > 0) {
        tx.create(alarms().doc(), {
          familyId: z.familyId,
          familyName: fam.name,
          zoneId: z.id,
          zoneName: z.name,
          uid: subject.uid,
          displayName: subject.displayName,
          lat: fix.lat,
          lng: fix.lng,
          distanceM,
          radius: z.radius,
          recipients: alarmFor,
          openFor: alarmFor,
          acknowledgedBy: [],
          active: true,
          createdAt: FieldValue.serverTimestamp(),
        });
      }
      for (const uid of alarmFor) {
        queueNotification(tx, uid, {
          kind: "geofence_exit",
          title: `ALARM: ${subject.displayName} left ${z.name}`,
          body: `${away} from the centre (safe zone ${formatRadius(z.radius)}) · ${fam.name}`,
          link,
          priority: "critical",
        }, outbox);
      }
      // Everyone else still gets the ordinary "left" alert if it's switched on.
      if (z.notifyOnExit) {
        for (const uid of others.filter((u) => !alarmFor.includes(u))) {
          queueNotification(tx, uid, { kind: "geofence_exit", title: `${subject.displayName} left ${z.name}`, body: `${fam.name} · safe zone alert`, link }, outbox);
        }
      }
      continue;
    }

    if (event === "enter" && openAlarm) {
      // Tell whoever got the alarm that the person is back, even if arrival alerts are off.
      for (const uid of fam.managers.filter((u) => u !== subject.uid)) {
        queueNotification(tx, uid, { kind: "geofence_enter", title: `${subject.displayName} is back inside ${z.name}`, body: `${fam.name} · alarm cleared`, link }, outbox);
      }
      if (!z.notifyOnEnter) continue;
      for (const uid of others.filter((u) => !fam.managers.includes(u))) {
        queueNotification(tx, uid, { kind: "geofence_enter", title: `${subject.displayName} arrived at ${z.name}`, body: `${fam.name} · safe zone alert`, link }, outbox);
      }
      continue;
    }

    const wanted = event === "enter" ? z.notifyOnEnter : z.notifyOnExit;
    if (!wanted) continue;
    for (const uid of others) {
      queueNotification(tx, uid, {
        kind: event === "enter" ? "geofence_enter" : "geofence_exit",
        title: event === "enter" ? `${subject.displayName} arrived at ${z.name}` : `${subject.displayName} left ${z.name}`,
        body: `${fam.name} · safe zone alert`,
        link,
      }, outbox);
    }
  }
  return { state, events: fired };
}
