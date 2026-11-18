import "server-only";
import { FieldValue, Timestamp, type DocumentReference } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import { getFamilyForMember } from "./service.server";

/*
 * families/{familyId}/events/{id} — the family's activity feed (SOS, safe-zone
 * arrivals/departures). Members-only reads; server-only writes.
 */
export type FamilyEventType = "sos" | "sos_resolved" | "sos_cancelled" | "geofence_enter" | "geofence_exit";

export interface FamilyEvent {
  id: string;
  type: FamilyEventType;
  uid: string;
  displayName: string;
  zoneName: string | null;
  at: number;
}

interface Writer {
  create(ref: DocumentReference, data: FirebaseFirestore.WithFieldValue<FirebaseFirestore.DocumentData>): unknown;
}

const events = (familyId: string) => adminDb().collection("families").doc(familyId).collection("events");

export function queueFamilyEvent(
  w: Writer,
  familyId: string,
  e: { type: FamilyEventType; uid: string; displayName: string; zoneName?: string | null; refId?: string | null },
) {
  w.create(events(familyId).doc(), {
    type: e.type,
    uid: e.uid,
    displayName: e.displayName,
    zoneName: e.zoneName ?? null,
    refId: e.refId ?? null,
    at: FieldValue.serverTimestamp(),
  });
}

export async function listFamilyEvents(familyId: string, viewerUid: string, limit = 30): Promise<FamilyEvent[]> {
  await getFamilyForMember(familyId, viewerUid); // members only (404 otherwise)
  const snap = await events(familyId).orderBy("at", "desc").limit(limit).get();
  return snap.docs.map((d) => ({
    id: d.id,
    type: d.get("type"),
    uid: d.get("uid"),
    displayName: d.get("displayName"),
    zoneName: d.get("zoneName") ?? null,
    at: d.get("at") instanceof Timestamp ? d.get("at").toMillis() : 0,
  }));
}

/** Recent events across all the viewer's families, newest first. */
export async function listMyRecentEvents(familyIds: string[], viewerUid: string, limit = 10) {
  const all = await Promise.all(familyIds.map((f) => listFamilyEvents(f, viewerUid, limit).then((es) => es.map((e) => ({ ...e, familyId: f })))));
  return all.flat().sort((a, b) => b.at - a.at).slice(0, limit);
}
