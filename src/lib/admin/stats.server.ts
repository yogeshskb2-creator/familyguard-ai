import "server-only";
import { Timestamp } from "firebase-admin/firestore";
import { configuredProviders } from "@/lib/ai/providers.server";
import { adminAuth, adminDb } from "@/lib/firebase/admin";
import { SECURITY_EVENT_LABEL, type SecurityEventType } from "@/lib/security/events.server";
import type { NotificationKind } from "@/types/models";

/*
 * Admin statistics — AGGREGATES ONLY. Nothing here returns a user's name,
 * email, phone, location, family name or message. Security events are
 * already pseudonymous (hashed uid, truncated IP).
 */

const db = () => adminDb();
const count = async (q: FirebaseFirestore.Query) => (await q.count().get()).data().count;
const since = (ms: number) => Timestamp.fromMillis(Date.now() - ms);
const DAY = 24 * 60 * 60 * 1000;
const NOTIFICATION_KINDS: NotificationKind[] = ["sos", "geofence_enter", "geofence_exit", "invitation", "sharing_started", "sharing_stopped", "device"];
const FAMILY_SCAN_CAP = 5000;
const startedAt = Date.now();

export interface HealthCheck {
  name: string;
  status: "ok" | "warn" | "fail";
  detail: string;
}

export interface AdminStats {
  generatedAt: number;
  users: { total: number; newLast7d: number };
  families: { total: number; active: number; activeCapped: boolean };
  devices: { active: number; pushEnabled: number };
  location: { sharing: number; onlineNow: number };
  sos: { active: number; last30d: number };
  safeZones: number;
  notifications: { last7d: number; byKind: { kind: NotificationKind; count: number }[] };
  security: {
    last24h: number;
    last7d: number;
    byType: { type: SecurityEventType; label: string; count: number }[];
    recent: { type: SecurityEventType; label: string; at: number; route: string | null; ipPrefix: string | null; uidHash: string | null }[];
  };
  health: HealthCheck[];
}

async function timed<T>(fn: () => Promise<T>): Promise<{ ms: number; ok: boolean }> {
  const t = performance.now();
  try {
    await fn();
    return { ms: Math.round(performance.now() - t), ok: true };
  } catch {
    return { ms: Math.round(performance.now() - t), ok: false };
  }
}

async function healthChecks(): Promise<HealthCheck[]> {
  const [fs, auth] = await Promise.all([
    timed(() => db().collection("users").limit(1).get()),
    timed(() => adminAuth().listUsers(1)),
  ]);
  const lat = (r: { ms: number; ok: boolean }, name: string): HealthCheck => ({
    name,
    status: !r.ok ? "fail" : r.ms > 1500 ? "warn" : "ok",
    detail: r.ok ? `${r.ms} ms` : `unreachable after ${r.ms} ms`,
  });
  const ai = configuredProviders();
  const uptimeH = (Date.now() - startedAt) / 3_600_000;
  return [
    lat(fs, "Firestore"),
    lat(auth, "Firebase Auth"),
    {
      name: "Push (FCM web-push key)",
      status: process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY ? "ok" : "warn",
      detail: process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY ? "configured" : "missing — push disabled",
    },
    {
      name: "Google Maps key",
      status: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ? "ok" : "warn",
      detail: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ? "configured" : "missing — schematic map only",
    },
    { name: "AI providers", status: ai.length ? "ok" : "warn", detail: ai.length ? ai.join(", ") : "none — quick answers only" },
    {
      name: "Security log salt",
      status: process.env.SECURITY_LOG_SALT ? "ok" : "warn",
      detail: process.env.SECURITY_LOG_SALT ? "set" : "using default — set SECURITY_LOG_SALT",
    },
    {
      name: "Environment",
      status: process.env.FIREBASE_AUTH_EMULATOR_HOST ? "warn" : "ok",
      detail: `${process.env.FIREBASE_AUTH_EMULATOR_HOST ? "EMULATORS" : "production"} · Node ${process.version} · up ${uptimeH < 1 ? `${Math.round(uptimeH * 60)} min` : `${uptimeH.toFixed(1)} h`}${process.env.VERCEL_GIT_COMMIT_SHA ? ` · ${process.env.VERCEL_GIT_COMMIT_SHA.slice(0, 7)}` : ""}`,
    },
  ];
}

export async function getAdminStats(): Promise<AdminStats> {
  const items = db().collectionGroup("items");
  const [
    usersTotal,
    usersNew,
    familiesTotal,
    familySnap,
    devicesActive,
    devicesPush,
    sharing,
    onlineNow,
    sosActive,
    sos30,
    zones,
    notif7,
    kindCounts,
    secSnap,
    health,
  ] = await Promise.all([
    count(db().collection("users")),
    count(db().collection("users").where("createdAt", ">=", since(7 * DAY))),
    count(db().collection("families")),
    db().collection("families").select("memberIds").limit(FAMILY_SCAN_CAP).get(),
    count(db().collection("devices").where("status", "==", "active")),
    count(db().collection("devices").where("status", "==", "active").where("pushEnabled", "==", true)),
    count(db().collection("locations")),
    count(db().collection("locations").where("updatedAt", ">=", since(2 * 60_000))),
    count(db().collection("emergencyAlerts").where("status", "==", "active")),
    count(db().collection("emergencyAlerts").where("createdAt", ">=", since(30 * DAY))),
    count(db().collection("geofences")),
    count(items.where("createdAt", ">=", since(7 * DAY))),
    Promise.all(NOTIFICATION_KINDS.map(async (kind) => ({ kind, count: await count(items.where("kind", "==", kind).where("createdAt", ">=", since(7 * DAY))) }))),
    db().collection("securityEvents").where("at", ">=", since(7 * DAY)).orderBy("at", "desc").limit(1000).get(),
    healthChecks(),
  ]);

  const events = secSnap.docs.map((d) => ({
    type: d.get("type") as SecurityEventType,
    at: (d.get("at") as Timestamp | undefined)?.toMillis() ?? 0,
    route: (d.get("route") as string | null) ?? null,
    ipPrefix: (d.get("ipPrefix") as string | null) ?? null,
    uidHash: (d.get("uidHash") as string | null) ?? null,
  }));
  const byType = new Map<SecurityEventType, number>();
  events.forEach((e) => byType.set(e.type, (byType.get(e.type) ?? 0) + 1));

  return {
    generatedAt: Date.now(),
    users: { total: usersTotal, newLast7d: usersNew },
    families: {
      total: familiesTotal,
      // "Active" = at least two members (an actual family using the app together).
      active: familySnap.docs.filter((d) => ((d.get("memberIds") as string[] | undefined) ?? []).length >= 2).length,
      activeCapped: familySnap.size >= FAMILY_SCAN_CAP,
    },
    devices: { active: devicesActive, pushEnabled: devicesPush },
    location: { sharing, onlineNow },
    sos: { active: sosActive, last30d: sos30 },
    safeZones: zones,
    notifications: { last7d: notif7, byKind: kindCounts.filter((k) => k.count > 0) },
    security: {
      last24h: events.filter((e) => e.at >= Date.now() - DAY).length,
      last7d: events.length,
      byType: [...byType.entries()].map(([type, c]) => ({ type, label: SECURITY_EVENT_LABEL[type] ?? type, count: c })).sort((a, b) => b.count - a.count),
      recent: events.slice(0, 15).map((e) => ({ ...e, label: SECURITY_EVENT_LABEL[e.type] ?? e.type })),
    },
    health,
  };
}
