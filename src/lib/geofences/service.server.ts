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
import type { Geofence } from "@/types/models";
import type { CreateZone } from "./validation";
import { ZONE_LIMITS, nextZoneState } from "./zones";

/*
 * geofences/{zoneId} — safe zones belonging to ONE family.
 *  - Members can view a family's zones; owners/guardians manage them.
 *  - Zones are evaluated server-side, only against location updates a person
 *    has consented to share WITH THAT FAMILY (see evaluateZonesInTx).
 */

const zones = () => adminDb().collection("geofences");
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
    createdAt: ms(d.createdAt),
  };
}

const manageable = canManageInvites; // owner or guardian

export async function listZones(familyId: string, viewerUid: string): Promise<Geofence[]> {
  await getFamilyForMember(familyId, viewerUid); // 404 for non-members
  const snap = await zones().where("familyId", "==", familyId).get();
  return snap.docs.map((d) => toZone(d.id, d.data())).sort((a, b) => a.createdAt - b.createdAt);
}

export async function createZone(user: SessionUser, familyId: string, input: CreateZone): Promise<Geofence> {
  const family = await getFamilyForMember(familyId, user.uid);
  if (!manageable(family.myRole)) throw forbidden("Only owners and guardians can create safe zones.");
  const existing = await zones().where("familyId", "==", familyId).count().get();
  if (existing.data().count >= ZONE_LIMITS.maxZonesPerFamily) {
    throw new FamilyError(409, "zone_limit", `A family can have at most ${ZONE_LIMITS.maxZonesPerFamily} safe zones.`);
  }
  const ref = zones().doc();
  await ref.create({
    ...input,
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
  return ref;
}

export async function updateZone(user: SessionUser, familyId: string, zoneId: string, input: Partial<CreateZone>): Promise<Geofence> {
  const ref = await loadManageable(user, familyId, zoneId);
  await ref.update({ ...input, updatedAt: FieldValue.serverTimestamp() });
  return toZone(ref.id, (await ref.get()).data()!);
}

export async function deleteZone(user: SessionUser, familyId: string, zoneId: string): Promise<void> {
  const ref = await loadManageable(user, familyId, zoneId);
  await ref.delete();
}

export async function countZones(familyIds: string[]): Promise<number> {
  if (familyIds.length === 0) return 0;
  const agg = await zones().where("familyId", "in", familyIds.slice(0, 30)).count().get();
  return agg.data().count;
}

// ── Evaluation (called from recordLocation's transaction) ─────────

export interface ZoneEvalContext {
  zones: Geofence[];
  /** familyId → { name, memberIds } for notification fan-out. */
  families: Map<string, { name: string; memberIds: string[] }>;
}

/** READ phase: load zones + family member lists for the families the fix is shared with. */
export async function loadZoneContext(tx: Transaction, sharedWith: string[]): Promise<ZoneEvalContext> {
  if (sharedWith.length === 0) return { zones: [], families: new Map() };
  const [zoneSnap, ...famSnaps] = await Promise.all([
    tx.get(zones().where("familyId", "in", sharedWith)),
    ...sharedWith.map((f) => tx.get(adminDb().collection("families").doc(f))),
  ]);
  const families = new Map<string, { name: string; memberIds: string[] }>();
  famSnaps.forEach((s, i) => s.exists && families.set(sharedWith[i]!, { name: s.get("name"), memberIds: s.get("memberIds") ?? [] }));
  return { zones: zoneSnap.docs.map((d) => toZone(d.id, d.data())), families };
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
    const { inside, event } = nextZoneState(prevState[z.id], z, fix);
    if (inside !== undefined) state[z.id] = inside;
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
    const wanted = z.alertsEnabled && (event === "enter" ? z.notifyOnEnter : z.notifyOnExit);
    if (!wanted) continue;
    for (const uid of fam.memberIds) {
      if (uid === subject.uid) continue;
      queueNotification(tx, uid, {
        kind: event === "enter" ? "geofence_enter" : "geofence_exit",
        title: event === "enter" ? `${subject.displayName} arrived at ${z.name}` : `${subject.displayName} left ${z.name}`,
        body: `${fam.name} · safe zone alert`,
        link: `/map?family=${z.familyId}`,
      }, outbox);
    }
  }
  return { state, events: fired };
}
