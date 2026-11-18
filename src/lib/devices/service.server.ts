import "server-only";
import { FieldValue, Timestamp, type DocumentData } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import type { SessionUser } from "@/lib/auth/session";
import { FamilyError } from "@/lib/families/errors";
import { PushOutbox } from "@/lib/notifications/push.server";
import { queueNotification } from "@/lib/notifications/service.server";
import type { DeviceType } from "@/types/models";
import { DEVICE_LIMITS } from "./validation";

/*
 * devices/{deviceId} — devices a user EXPLICITLY registered to their own
 * account (from that device). Nothing here discovers or reads any other
 * device. The push token is stored server-side only and never returned.
 */

const devices = () => adminDb().collection("devices");
const ms = (v: unknown) => (v instanceof Timestamp ? v.toMillis() : 0);

export interface DeviceView {
  id: string;
  name: string;
  type: DeviceType;
  platform: string;
  status: "active" | "revoked";
  pushEnabled: boolean;
  registeredAt: number;
  lastActiveAt: number;
  lastLocationAt: number | null;
  online: boolean;
  sendingLocation: boolean;
}

function toView(id: string, d: DocumentData, now = Date.now()): DeviceView {
  const lastActiveAt = ms(d.lastActiveAt);
  const lastLocationAt = d.lastLocationAt ? ms(d.lastLocationAt) : null;
  return {
    id,
    name: d.name,
    type: d.type,
    platform: d.platform ?? "",
    status: d.status,
    pushEnabled: d.pushEnabled === true,
    registeredAt: ms(d.registeredAt),
    lastActiveAt,
    lastLocationAt,
    online: d.status === "active" && now - lastActiveAt <= DEVICE_LIMITS.onlineWindowMs,
    sendingLocation: d.status === "active" && lastLocationAt !== null && now - lastLocationAt <= DEVICE_LIMITS.sendingWindowMs,
  };
}

/** Load a device the caller owns; anything else is "not found" (no existence leaks). */
async function owned(uid: string, deviceId: string) {
  const ref = devices().doc(deviceId);
  const snap = await ref.get();
  if (!snap.exists || snap.get("ownerId") !== uid) throw new FamilyError(404, "not_found", "Device not found.");
  return { ref, snap };
}

export async function listMyDevices(uid: string): Promise<DeviceView[]> {
  const snap = await devices().where("ownerId", "==", uid).get();
  const now = Date.now();
  return snap.docs
    .map((d) => toView(d.id, d.data(), now))
    .sort((a, b) => Number(b.status === "active") - Number(a.status === "active") || b.lastActiveAt - a.lastActiveAt);
}

/** Register THIS device. Other devices on the account get a security notification. */
export async function registerDevice(user: SessionUser, input: { name: string; type: DeviceType; platform: string }): Promise<DeviceView> {
  const active = await devices().where("ownerId", "==", user.uid).where("status", "==", "active").count().get();
  if (active.data().count >= DEVICE_LIMITS.maxActivePerUser) {
    throw new FamilyError(409, "device_limit", `You can register up to ${DEVICE_LIMITS.maxActivePerUser} devices. Remove one first.`);
  }
  const ref = devices().doc();
  const outbox = new PushOutbox();
  await adminDb().runTransaction(async (tx) => {
    outbox.reset();
    tx.create(ref, {
      ownerId: user.uid,
      name: input.name,
      type: input.type,
      platform: input.platform,
      status: "active",
      pushEnabled: false,
      registeredAt: FieldValue.serverTimestamp(),
      lastActiveAt: FieldValue.serverTimestamp(),
      lastLocationAt: null,
    });
    queueNotification(
      tx,
      user.uid,
      {
        kind: "device",
        title: `New device added: ${input.name}`,
        body: `${input.platform || "A device"} was registered to your account. If this wasn't you, remove it and sign out everywhere.`,
        link: "/devices",
      },
      outbox,
    );
  });
  await outbox.flush();
  return toView(ref.id, (await ref.get()).data()!);
}

export async function renameDevice(uid: string, deviceId: string, name: string): Promise<DeviceView> {
  const { ref } = await owned(uid, deviceId);
  await ref.update({ name });
  return toView(ref.id, (await ref.get()).data()!);
}

/** "I'm still here" from an open app on this device (throttled). Revoked devices get 410. */
export async function heartbeat(uid: string, deviceId: string): Promise<DeviceView> {
  const { ref, snap } = await owned(uid, deviceId);
  if (snap.get("status") !== "active") throw new FamilyError(410, "revoked", "This device was removed from your account.");
  if (Date.now() - ms(snap.get("lastActiveAt")) >= DEVICE_LIMITS.heartbeatMinMs) {
    await ref.update({ lastActiveAt: FieldValue.serverTimestamp() });
  }
  return toView(ref.id, (await ref.get()).data()!);
}

/** Remove a device: it stops receiving pushes immediately; its token is deleted. */
export async function revokeDevice(uid: string, deviceId: string): Promise<DeviceView> {
  const { ref, snap } = await owned(uid, deviceId);
  const outbox = new PushOutbox();
  await adminDb().runTransaction(async (tx) => {
    outbox.reset();
    tx.update(ref, { status: "revoked", pushEnabled: false, pushToken: FieldValue.delete(), revokedAt: FieldValue.serverTimestamp() });
    queueNotification(
      tx,
      uid,
      { kind: "device", title: `Device removed: ${snap.get("name")}`, body: "It will no longer receive notifications.", link: "/devices" },
      outbox,
    );
  });
  await outbox.flush();
  return toView(ref.id, (await ref.get()).data()!);
}

export async function deleteDevice(uid: string, deviceId: string): Promise<void> {
  const { ref } = await owned(uid, deviceId);
  await ref.delete();
}

/** Store the FCM token for push on this (active, owned) device. */
export async function enablePush(uid: string, deviceId: string, token: string): Promise<DeviceView> {
  const { ref, snap } = await owned(uid, deviceId);
  if (snap.get("status") !== "active") throw new FamilyError(410, "revoked", "This device was removed from your account.");
  // A token belongs to one browser profile: detach it from any of this user's other device records.
  const dupes = await devices().where("ownerId", "==", uid).where("pushToken", "==", token).get();
  const batch = adminDb().batch();
  dupes.docs.filter((d) => d.id !== deviceId).forEach((d) => batch.update(d.ref, { pushEnabled: false, pushToken: FieldValue.delete() }));
  batch.update(ref, { pushEnabled: true, pushToken: token, lastActiveAt: FieldValue.serverTimestamp() });
  await batch.commit();
  return toView(ref.id, (await ref.get()).data()!);
}

export async function disablePush(uid: string, deviceId: string): Promise<DeviceView> {
  const { ref } = await owned(uid, deviceId);
  await ref.update({ pushEnabled: false, pushToken: FieldValue.delete() });
  return toView(ref.id, (await ref.get()).data()!);
}

/** Called after a consented location update that came from a registered device. Best-effort. */
export async function markLocationFromDevice(uid: string, deviceId: string): Promise<void> {
  try {
    const { ref, snap } = await owned(uid, deviceId);
    if (snap.get("status") === "active") {
      await ref.update({ lastLocationAt: FieldValue.serverTimestamp(), lastActiveAt: FieldValue.serverTimestamp() });
    }
  } catch {
    /* unknown or foreign device id: ignore */
  }
}
