/** Pure location helpers — shared by client, server and tests. */

export interface Fix {
  lat: number;
  lng: number;
  accuracy: number;
  at: number; // epoch ms
}

const R = 6_371_000; // metres

export function distanceMeters(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

export const SEND_POLICY = {
  /** Never send more often than this. */
  minIntervalMs: 15_000,
  /** Send if moved at least this far… */
  minMoveMeters: 25,
  /** …or at least this often while stationary, as a heartbeat. */
  heartbeatMs: 60_000,
  /** Ignore fixes worse than this unless nothing better has been sent. */
  maxAccuracyMeters: 2_000,
};

/** Decide whether a new browser fix is worth sending to the server. */
export function shouldSend(last: Fix | null, next: Fix, policy = SEND_POLICY): boolean {
  if (!last) return true;
  const elapsed = next.at - last.at;
  if (elapsed < policy.minIntervalMs) return false;
  if (next.accuracy > policy.maxAccuracyMeters && last.accuracy <= policy.maxAccuracyMeters) return false;
  if (elapsed >= policy.heartbeatMs) return true;
  return distanceMeters(last, next) >= Math.max(policy.minMoveMeters, Math.min(next.accuracy, 100));
}

/** A sharer counts as online if their last update is this recent. */
export const ONLINE_WINDOW_MS = 2 * 60_000;

export type Presence = "online" | "offline";
export function presence(updatedAt: number, now = Date.now()): Presence {
  return now - updatedAt <= ONLINE_WINDOW_MS ? "online" : "offline";
}

/** Should a history point be stored? Keeps history meaningful and small. */
export const HISTORY_POLICY = { minMoveMeters: 50, minIntervalMs: 5 * 60_000 };
export function shouldRecordHistory(last: { lat: number; lng: number; at: number } | null, next: Fix): boolean {
  if (!last) return true;
  return next.at - last.at >= HISTORY_POLICY.minIntervalMs || distanceMeters(last, next) >= HISTORY_POLICY.minMoveMeters;
}

export function googleMapsLink(lat: number, lng: number): string {
  return `https://www.google.com/maps/search/?api=1&query=${lat.toFixed(6)},${lng.toFixed(6)}`;
}

export function formatAccuracy(m: number): string {
  return m < 1000 ? `±${Math.round(m)} m` : `±${(m / 1000).toFixed(1)} km`;
}
