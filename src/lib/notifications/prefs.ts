import { z } from "zod";
import type { NotificationKind } from "@/types/models";

/** Push categories a user can switch off. The in-app inbox always records everything. */
export const PUSH_CATEGORIES = ["sos", "zones", "invitations", "sharing", "devices"] as const;
export type PushCategory = (typeof PUSH_CATEGORIES)[number];
export type NotificationPrefs = Record<PushCategory, boolean>;

export const DEFAULT_PREFS: NotificationPrefs = { sos: true, zones: true, invitations: true, sharing: true, devices: true };

export const CATEGORY_LABEL: Record<PushCategory, { title: string; hint: string }> = {
  sos: { title: "Emergency SOS", hint: "Alerts from your family, and replies to your own SOS. Strongly recommended." },
  zones: { title: "Safe-zone arrivals & departures", hint: "When someone arrives at or leaves a safe zone." },
  invitations: { title: "Family invitations", hint: "When someone invites you to a family." },
  sharing: { title: "Location sharing changes", hint: "When a family member starts or stops sharing with you, or asks you to share." },
  devices: { title: "Security: your devices", hint: "When a device is added to or removed from your account." },
};

export function categoryOf(kind: NotificationKind): PushCategory {
  if (kind === "sos") return "sos";
  if (kind === "geofence_enter" || kind === "geofence_exit") return "zones";
  if (kind === "invitation") return "invitations";
  if (kind === "sharing_started" || kind === "sharing_stopped" || kind === "sharing_request") return "sharing";
  return "devices";
}

export function prefsFromDoc(v: unknown): NotificationPrefs {
  const o = (v && typeof v === "object" ? v : {}) as Partial<Record<PushCategory, unknown>>;
  return Object.fromEntries(PUSH_CATEGORIES.map((c) => [c, o[c] === undefined ? DEFAULT_PREFS[c] : o[c] === true])) as NotificationPrefs;
}

export const prefsSchema = z.object(Object.fromEntries(PUSH_CATEGORIES.map((c) => [c, z.boolean()])) as Record<PushCategory, z.ZodBoolean>).strict();
