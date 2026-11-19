import "server-only";
import { FieldValue, Timestamp, type Transaction } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import type { SessionUser } from "@/lib/auth/session";
import { FamilyError } from "@/lib/families/errors";
import { getFamilyForMember, listMyFamilies } from "@/lib/families/service.server";
import { consentFromDoc } from "./consent";
import type { FamilyRole, SharingConsent } from "@/types/models";
import { presence, shouldRecordHistory, type Presence } from "./geo";
import { applyZoneTransitions, loadZoneContext } from "@/lib/geofences/service.server";
import { PushOutbox } from "@/lib/notifications/push.server";
import { queueNotification } from "@/lib/notifications/service.server";
import { isFreshFix, type LocationUpdate, type StartSharing } from "./validation";

/*
 * Consent model
 *  - users/{uid}.sharing  — the consent record (server-written only).
 *  - locations/{uid}      — latest fix. Exists ONLY while consent is active;
 *                           deleted the moment sharing stops.
 *  - locationHistory/{uid}/points — optional, opt-in, auto-expiring.
 * A location is visible to a family only if (a) the sharer chose that
 * family, (b) the sharer is still a member, (c) the viewer is a member.
 */

const db = () => adminDb();
const userRef = (uid: string) => db().collection("users").doc(uid);
const locRef = (uid: string) => db().collection("locations").doc(uid);
const historyCol = (uid: string) => db().collection("locationHistory").doc(uid).collection("points");

const ms = (v: unknown) => (v instanceof Timestamp ? v.toMillis() : typeof v === "number" ? v : 0);
const DAY = 24 * 60 * 60 * 1000;

export interface LiveLocationView {
  lat: number;
  lng: number;
  accuracy: number;
  heading: number | null;
  speed: number | null;
  updatedAt: number;
  presence: Presence;
}

export interface MySharingState {
  consent: SharingConsent;
  location: LiveLocationView | null;
}

export interface MemberLocation {
  uid: string;
  displayName: string;
  color: string;
  role: FamilyRole;
  sharing: boolean;
  location: LiveLocationView | null;
}

export interface HistoryPoint {
  lat: number;
  lng: number;
  accuracy: number;
  recordedAt: number;
}

function toView(d: FirebaseFirestore.DocumentData, now = Date.now()): LiveLocationView {
  const updatedAt = ms(d.updatedAt);
  return {
    lat: d.lat,
    lng: d.lng,
    accuracy: d.accuracy,
    heading: d.heading ?? null,
    speed: d.speed ?? null,
    updatedAt,
    presence: presence(updatedAt, now),
  };
}

async function myFamilyIds(tx: Transaction, uid: string) {
  const snap = await tx.get(userRef(uid));
  if (!snap.exists) throw new FamilyError(409, "no_profile", "Your profile isn't set up yet. Sign in again.");
  return { snap, familyIds: (snap.get("familyIds") as string[] | undefined) ?? [], consent: consentFromDoc(snap.get("sharing")) };
}

function assertOwnFamilies(requested: string[], mine: string[]) {
  const foreign = requested.filter((f) => !mine.includes(f));
  if (foreign.length) throw new FamilyError(403, "not_a_member", "You can only share with families you belong to.");
}

// ── Consent ────────────────────────────────────────────────

export async function getMySharingState(uid: string): Promise<MySharingState> {
  const [u, l] = await Promise.all([userRef(uid).get(), locRef(uid).get()]);
  const consent = consentFromDoc(u.get("sharing"));
  return { consent, location: consent.active && l.exists ? toView(l.data()!) : null };
}

/** Explicit opt-in. Called only after the user pressed Share and the browser granted permission. */
export async function startSharing(user: SessionUser, input: StartSharing): Promise<SharingConsent> {
  const familyIds = [...new Set(input.familyIds)];
  const outbox = new PushOutbox();
  await db().runTransaction(async (tx) => {
    outbox.reset();
    const { familyIds: mine, consent, snap } = await myFamilyIds(tx, user.uid);
    assertOwnFamilies(familyIds, mine);
    const loc = await tx.get(locRef(user.uid));
    const fams = consent.active ? [] : await Promise.all(familyIds.map((f) => tx.get(db().collection("families").doc(f))));
    tx.update(userRef(user.uid), {
      sharing: {
        active: true,
        familyIds,
        grantedAt: FieldValue.serverTimestamp(),
        revokedAt: null,
        keepHistory: input.keepHistory,
        historyRetentionDays: input.historyRetentionDays,
      },
      updatedAt: FieldValue.serverTimestamp(),
    });
    if (loc.exists) tx.update(locRef(user.uid), { sharedWith: familyIds });
    // Tell the chosen families (only on the off → on transition).
    const name = (snap.get("displayName") as string) ?? user.displayName;
    for (const f of fams) {
      for (const uid of ((f.get("memberIds") as string[] | undefined) ?? []).filter((u) => u !== user.uid)) {
        queueNotification(
          tx,
          uid,
          { kind: "sharing_started", title: `${name} is now sharing their location`, body: `With ${f.get("name")}.`, link: `/map?family=${f.id}` },
          outbox,
        );
      }
    }
  });
  await outbox.flush();
  return (await getMySharingState(user.uid)).consent;
}

export async function updateSharing(user: SessionUser, input: Partial<StartSharing>): Promise<SharingConsent> {
  await db().runTransaction(async (tx) => {
    const { familyIds, consent } = await myFamilyIds(tx, user.uid);
    if (!consent.active) throw new FamilyError(409, "not_sharing", "You're not sharing your location.");
    if (input.familyIds) assertOwnFamilies(input.familyIds, familyIds);
    const loc = await tx.get(locRef(user.uid));
    const patch: Record<string, unknown> = { updatedAt: FieldValue.serverTimestamp() };
    if (input.familyIds) patch["sharing.familyIds"] = [...new Set(input.familyIds)];
    if (input.keepHistory !== undefined) patch["sharing.keepHistory"] = input.keepHistory;
    if (input.historyRetentionDays !== undefined) patch["sharing.historyRetentionDays"] = input.historyRetentionDays;
    tx.update(userRef(user.uid), patch);
    if (input.familyIds && loc.exists) tx.update(locRef(user.uid), { sharedWith: [...new Set(input.familyIds)] });
  });
  return (await getMySharingState(user.uid)).consent;
}

/** Revoke consent. The live location document is DELETED, not hidden. */
export async function stopSharing(uid: string): Promise<void> {
  const outbox = new PushOutbox();
  await db().runTransaction(async (tx) => {
    outbox.reset();
    const snap = await tx.get(userRef(uid));
    if (!snap.exists) return;
    const consent = consentFromDoc(snap.get("sharing"));
    const fams = consent.active ? await Promise.all(consent.familyIds.map((f) => tx.get(db().collection("families").doc(f)))) : [];
    tx.update(userRef(uid), {
      "sharing.active": false,
      "sharing.revokedAt": FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    tx.delete(locRef(uid));
    const name = (snap.get("displayName") as string) ?? "A family member";
    for (const f of fams) {
      if (!f.exists) continue;
      for (const m of ((f.get("memberIds") as string[] | undefined) ?? []).filter((u) => u !== uid)) {
        queueNotification(
          tx,
          m,
          { kind: "sharing_stopped", title: `${name} stopped sharing their location`, body: `With ${f.get("name")}.`, link: `/family/${f.id}` },
          outbox,
        );
      }
    }
  });
  await outbox.flush();
}

// ── Location updates ───────────────────────────────────────

/**
 * Store a fix. Refused unless consent is active RIGHT NOW (checked in the
 * same transaction as the write), so a stale tab can't keep sharing after
 * the user stopped on another device.
 */
export async function recordLocation(user: SessionUser, fix: LocationUpdate): Promise<LiveLocationView> {
  const now = Date.now();
  if (!isFreshFix(fix.timestamp, now)) throw new FamilyError(422, "stale_fix", "Location fix is too old or from the future.");

  const outbox = new PushOutbox();
  // The view is built from exactly what this transaction wrote. Re-reading the
  // document after commit is racy: if sharing is stopped (another tab, account
  // deletion, leaving the last family) in between, the document is already
  // deleted and the re-read returns nothing.
  const view = await db().runTransaction(async (tx): Promise<LiveLocationView> => {
    outbox.reset();
    const { familyIds, consent, snap: userSnap } = await myFamilyIds(tx, user.uid);
    if (!consent.active) throw new FamilyError(409, "not_sharing", "Location sharing is off.");
    const sharedWith = consent.familyIds.filter((f) => familyIds.includes(f));
    if (sharedWith.length === 0) throw new FamilyError(409, "no_families", "You're not sharing with any family.");

    const loc = await tx.get(locRef(user.uid));
    // Safe zones: only those of families this person is sharing with (consent).
    const zoneCtx = await loadZoneContext(tx, sharedWith);
    const lastHistory = loc.exists && loc.get("historyLastAt")
      ? { lat: loc.get("historyLastLat") as number, lng: loc.get("historyLastLng") as number, at: ms(loc.get("historyLastAt")) }
      : null;
    const record = consent.keepHistory && shouldRecordHistory(lastHistory, { ...fix, at: now });

    const zones = applyZoneTransitions(
      tx,
      zoneCtx,
      { uid: user.uid, displayName: userSnap.get("displayName") ?? user.displayName },
      (loc.get("zoneState") as Record<string, boolean> | undefined) ?? {},
      fix,
      outbox,
    );

    const data = {
      uid: user.uid,
      lat: fix.lat,
      lng: fix.lng,
      accuracy: fix.accuracy,
      heading: fix.heading ?? null,
      speed: fix.speed ?? null,
      sharedWith,
      source: "web",
      updatedAt: Timestamp.fromMillis(now),
      zoneState: zones.state,
      ...(record ? { historyLastAt: Timestamp.fromMillis(now), historyLastLat: fix.lat, historyLastLng: fix.lng } : {}),
    };
    // mergeFields: replace each written field wholesale (so zoneState drops deleted
    // zones) while keeping fields not written this time (e.g. history markers).
    tx.set(locRef(user.uid), data, { mergeFields: Object.keys(data) });

    if (record) {
      tx.create(historyCol(user.uid).doc(), {
        lat: fix.lat,
        lng: fix.lng,
        accuracy: fix.accuracy,
        recordedAt: Timestamp.fromMillis(now),
        // Firestore TTL policy on `expireAt` deletes points automatically (see README).
        expireAt: Timestamp.fromMillis(now + consent.historyRetentionDays * DAY),
      });
    }
    return toView(data, now);
  });

  await outbox.flush();
  // Housekeeping only: the fix is already stored, so a failed prune must not
  // turn a successful update into an error for the client.
  await pruneExpiredHistory(user.uid, now).catch((err) => console.error("[location] history prune failed", err));
  return view;
}

// ── History (owner only) ───────────────────────────────────

/** Backstop for the TTL policy, which can lag by up to 24 h. */
async function pruneExpiredHistory(uid: string, now: number) {
  const old = await historyCol(uid).where("expireAt", "<=", Timestamp.fromMillis(now)).limit(100).get();
  if (old.empty) return;
  const batch = db().batch();
  old.docs.forEach((d) => batch.delete(d.ref));
  await batch.commit();
}

export async function listMyHistory(uid: string, limit = 500): Promise<HistoryPoint[]> {
  const snap = await historyCol(uid).orderBy("recordedAt", "desc").limit(limit).get();
  const now = Date.now();
  return snap.docs
    .filter((d) => ms(d.get("expireAt")) > now)
    .map((d) => ({ lat: d.get("lat"), lng: d.get("lng"), accuracy: d.get("accuracy"), recordedAt: ms(d.get("recordedAt")) }));
}

/** Permanently delete all of a user's location history. */
export async function deleteMyHistory(uid: string): Promise<number> {
  let deleted = 0;
  for (;;) {
    const snap = await historyCol(uid).limit(400).get();
    if (snap.empty) break;
    const batch = db().batch();
    snap.docs.forEach((d) => batch.delete(d.ref));
    await batch.commit();
    deleted += snap.size;
  }
  await db().collection("locationHistory").doc(uid).delete().catch(() => undefined);
  await locRef(uid)
    .update({ historyLastAt: FieldValue.delete(), historyLastLat: FieldValue.delete(), historyLastLng: FieldValue.delete() })
    .catch(() => undefined);
  return deleted;
}

// ── Asking someone to share ────────────────────────────────

/**
 * A family member asks another member to share their location with this
 * family. It only sends a notification; the other person still decides.
 * Refused if they already share with this family.
 */
export async function requestLocationShare(user: SessionUser, familyId: string, targetUid: string): Promise<void> {
  if (targetUid === user.uid) throw new FamilyError(400, "self", "You can't ask yourself.");
  const outbox = new PushOutbox();
  await db().runTransaction(async (tx) => {
    outbox.reset();
    const fam = await tx.get(db().collection("families").doc(familyId));
    const memberIds = (fam.get("memberIds") as string[] | undefined) ?? [];
    // Non-members get the same answer as a missing family.
    if (!fam.exists || !memberIds.includes(user.uid)) throw new FamilyError(404, "not_found", "Not found.");
    if (!memberIds.includes(targetUid)) throw new FamilyError(404, "not_member", "That person isn't in this family.");
    const target = await tx.get(userRef(targetUid));
    const consent = consentFromDoc(target.get("sharing"));
    if (consent.active && consent.familyIds.includes(familyId)) {
      throw new FamilyError(409, "already_sharing", "They already share their location with this family.");
    }
    const me = await tx.get(userRef(user.uid));
    const name = (me.get("displayName") as string | undefined) ?? user.displayName ?? "A family member";
    queueNotification(
      tx,
      targetUid,
      {
        kind: "sharing_request",
        title: `${name} asked you to share your location`,
        body: `With ${fam.get("name")}. You decide: open the family and press Share my location.`,
        link: `/family/${familyId}`,
      },
      outbox,
    );
  });
  await outbox.flush();
}

// ── Family views ───────────────────────────────────────────

/** Members of a family with the locations they chose to share WITH THIS FAMILY. */
export async function getFamilyLocations(familyId: string, viewerUid: string): Promise<MemberLocation[]> {
  const family = await getFamilyForMember(familyId, viewerUid); // 404 for non-members
  const snaps = await db().getAll(...family.members.map((m) => locRef(m.uid)));
  const now = Date.now();
  return family.members.map((m, i) => {
    const d = snaps[i]?.data();
    const visible = Boolean(d && (d.sharedWith as string[] | undefined)?.includes(familyId));
    return {
      uid: m.uid,
      displayName: m.displayName,
      color: m.color,
      role: m.role,
      sharing: visible,
      location: visible ? toView(d!, now) : null,
    };
  });
}

/** Distinct other people currently sharing with at least one of my families. */
export async function countSharingWithMe(uid: string): Promise<{ sharing: number; online: number }> {
  const families = await listMyFamilies(uid);
  const myFamilyIds = new Set(families.map((f) => f.id));
  const others = [...new Set(families.flatMap((f) => f.members.map((m) => m.uid)))].filter((u) => u !== uid);
  if (others.length === 0) return { sharing: 0, online: 0 };
  const snaps = await db().getAll(...others.map(locRef));
  const now = Date.now();
  let sharing = 0;
  let online = 0;
  for (const s of snaps) {
    const d = s.data();
    if (!d || !((d.sharedWith as string[] | undefined) ?? []).some((f) => myFamilyIds.has(f))) continue;
    sharing++;
    if (presence(ms(d.updatedAt), now) === "online") online++;
  }
  return { sharing, online };
}
