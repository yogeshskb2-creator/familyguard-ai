import "server-only";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb, adminMessaging, isAdminConfigured } from "@/lib/firebase/admin";
import { categoryOf, prefsFromDoc } from "./prefs";
import type { NewNotification } from "./service.server";

/*
 * Push delivery (Firebase Cloud Messaging), decoupled from the database write:
 *
 *   tx(async () => { outbox.reset(); …queueNotification(tx, uid, n, outbox)… })
 *   await outbox.flush()   // only after the transaction COMMITTED
 *
 * Transactions can retry, so the outbox is reset at the start of every
 * attempt — a retried transaction never sends duplicate pushes, and a failed
 * one never sends any. Delivery is best-effort and never throws: the in-app
 * notification is the record of truth.
 *
 * Only devices the user registered AND explicitly enabled push on receive
 * pushes, and only for categories the user hasn't switched off.
 */

export interface PushMessage {
  title: string;
  body: string;
  link: string;
  kind: string;
  critical: boolean;
}

export interface PushTransport {
  /** Returns the tokens the provider reported as no longer valid. */
  send(uid: string, tokens: string[], msg: PushMessage): Promise<{ invalidTokens: string[] }>;
}

const INVALID_TOKEN_CODES = new Set(["messaging/registration-token-not-registered", "messaging/invalid-registration-token"]);

/** Production: real FCM via the Admin SDK. */
export const fcmTransport: PushTransport = {
  async send(_uid, tokens, msg) {
    const res = await adminMessaging().sendEachForMulticast({
      tokens,
      notification: { title: msg.title, body: msg.body },
      data: { link: msg.link, kind: msg.kind, critical: msg.critical ? "1" : "" },
      webpush: {
        fcmOptions: { link: msg.link },
        notification: {
          icon: "/icons/icon-192.png",
          badge: "/icons/icon-192.png",
          tag: msg.kind === "sos" ? "familyguard-sos" : msg.critical ? "familyguard-alarm" : undefined,
          renotify: msg.critical,
          vibrate: msg.critical ? [500, 200, 500, 200, 500] : undefined,
          requireInteraction: msg.critical,
        },
        headers: msg.critical ? { Urgency: "high" } : undefined,
      },
    });
    const invalidTokens = res.responses.flatMap((r, i) => (!r.success && INVALID_TOKEN_CODES.has(r.error?.code ?? "") ? [tokens[i]!] : []));
    return { invalidTokens };
  },
};

/**
 * Emulator/E2E only: FCM can't be emulated, so record what WOULD be sent in
 * a `_pushLog` collection (no client access; never used in production).
 */
export const emulatorTransport: PushTransport = {
  async send(uid, tokens, msg) {
    await adminDb().collection("_pushLog").add({ uid, deviceCount: tokens.length, ...msg, at: FieldValue.serverTimestamp() });
    return { invalidTokens: tokens.filter((t) => t.startsWith("invalid-")) };
  },
};

let override: PushTransport | null = null;
/** Tests can swap the transport. */
export function setPushTransport(t: PushTransport | null) {
  override = t;
}

function transport(): PushTransport | null {
  if (override) return override;
  if (process.env.FIREBASE_AUTH_EMULATOR_HOST) return emulatorTransport;
  return isAdminConfigured() ? fcmTransport : null;
}

export class PushOutbox {
  private jobs: { uid: string; n: NewNotification }[] = [];

  add(uid: string, n: NewNotification) {
    this.jobs.push({ uid, n });
  }

  /** Call at the start of every transaction attempt. */
  reset() {
    this.jobs = [];
  }

  get size() {
    return this.jobs.length;
  }

  /** Deliver after commit. Best-effort: logs and swallows errors. */
  async flush(): Promise<void> {
    const jobs = this.jobs;
    this.jobs = [];
    const t = transport();
    if (!t || jobs.length === 0) return;
    await Promise.all(jobs.map((j) => deliver(t, j.uid, j.n).catch((e) => console.error("[push]", j.uid, e))));
  }
}

async function deliver(t: PushTransport, uid: string, n: NewNotification) {
  const db = adminDb();
  const [user, devices] = await Promise.all([
    db.collection("users").doc(uid).get(),
    db.collection("devices").where("ownerId", "==", uid).where("pushEnabled", "==", true).where("status", "==", "active").get(),
  ]);
  if (!prefsFromDoc(user.get("notificationPrefs"))[categoryOf(n.kind)]) return; // user switched this category off
  const byToken = new Map(devices.docs.map((d) => [d.get("pushToken") as string, d.ref] as const).filter(([tok]) => Boolean(tok)));
  if (byToken.size === 0) return;

  const { invalidTokens } = await t.send(uid, [...byToken.keys()], {
    title: n.title,
    body: n.body,
    link: n.link ?? "/notifications",
    kind: n.kind,
    critical: n.priority === "critical",
  });
  // Uninstalled / expired subscriptions: turn push off for those devices.
  await Promise.all(
    invalidTokens.map((tok) => byToken.get(tok)?.update({ pushEnabled: false, pushToken: FieldValue.delete() })),
  );
}
