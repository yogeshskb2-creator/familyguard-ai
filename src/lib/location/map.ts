/** Pure helpers for the family map (no Google dependency — unit-testable). */
import { distanceMeters } from "./geo";

export interface LatLng {
  lat: number;
  lng: number;
}

export interface MemberLocationView {
  uid: string;
  displayName: string;
  color: string;
  role?: string;
  sharing: boolean;
  location: null | {
    lat: number;
    lng: number;
    accuracy: number;
    updatedAt: number;
    presence: "online" | "offline";
  };
}

export type PlacedMember = MemberLocationView & { location: NonNullable<MemberLocationView["location"]> };

/** Members that actually have a location to show (i.e. are sharing with this family). */
export function placedMembers(members: MemberLocationView[]): PlacedMember[] {
  return members.filter((m): m is PlacedMember => m.sharing && m.location !== null);
}

export interface Bounds {
  north: number;
  south: number;
  east: number;
  west: number;
}

export function boundsOf(points: LatLng[]): Bounds | null {
  if (points.length === 0) return null;
  return points.reduce<Bounds>(
    (b, p) => ({
      north: Math.max(b.north, p.lat),
      south: Math.min(b.south, p.lat),
      east: Math.max(b.east, p.lng),
      west: Math.min(b.west, p.lng),
    }),
    { north: -90, south: 90, east: -180, west: 180 },
  );
}

/** Default view: one point → street level; several → caller fits bounds; none → a neutral world view. */
export function initialView(points: LatLng[]): { center: LatLng; zoom: number } {
  const b = boundsOf(points);
  if (!b) return { center: { lat: 20, lng: 0 }, zoom: 2 };
  const center = { lat: (b.north + b.south) / 2, lng: (b.east + b.west) / 2 };
  if (points.length === 1) return { center, zoom: 15 };
  const spanKm = distanceMeters({ lat: b.north, lng: b.west }, { lat: b.south, lng: b.east }) / 1000;
  // ~ zoom that fits the diagonal in a ~600px viewport.
  const zoom = Math.max(3, Math.min(16, Math.round(Math.log2(40_000 / Math.max(spanKm, 0.05)) - 1)));
  return { center, zoom };
}

export interface SchematicPoint {
  uid: string;
  x: number; // % from left
  y: number; // % from top
}

/**
 * Project lat/lng onto a square canvas (equirectangular, corrected for
 * latitude) preserving relative distances and bearings. Used when map tiles
 * are unavailable. Returns positions in percent plus the real-world width of
 * the canvas for a scale bar.
 */
export function projectSchematic(points: (LatLng & { uid: string })[], padding = 14): { points: SchematicPoint[]; widthMeters: number } {
  if (points.length === 0) return { points: [], widthMeters: 0 };
  const b = boundsOf(points)!;
  const midLat = (b.north + b.south) / 2;
  const kx = Math.cos((midLat * Math.PI) / 180);
  const w = (b.east - b.west) * kx;
  const h = b.north - b.south;
  const span = Math.max(w, h, 0.0009); // ≥ ~100 m so a single point sits centred
  const cx = ((b.east + b.west) / 2) * kx;
  const cy = (b.north + b.south) / 2;
  const usable = 100 - 2 * padding;
  const projected = points.map((p) => ({
    uid: p.uid,
    x: 50 + ((p.lng * kx - cx) / span) * usable,
    y: 50 - ((p.lat - cy) / span) * usable,
  }));
  const metersPerDegLat = 111_320;
  return { points: projected, widthMeters: (span * metersPerDegLat * 100) / usable };
}

/** A tidy scale-bar length (1/2/5 × 10ⁿ m) not longer than `maxMeters`. */
export function niceScale(maxMeters: number): { meters: number; label: string } {
  if (maxMeters <= 0) return { meters: 0, label: "" };
  const pow = 10 ** Math.floor(Math.log10(maxMeters));
  const meters = [5, 2, 1].map((m) => m * pow).find((v) => v <= maxMeters) ?? pow;
  return { meters, label: meters >= 1000 ? `${meters / 1000} km` : `${meters} m` };
}
