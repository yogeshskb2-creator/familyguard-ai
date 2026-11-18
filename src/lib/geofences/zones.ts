import { distanceMeters } from "@/lib/location/geo";

/**
 * Geofence transition logic (pure).
 *
 * GPS fixes wobble, so a person standing at a zone's edge must not trigger
 * endless "arrived / left" alerts. We therefore:
 *  - ignore fixes too imprecise to decide (accuracy > radius),
 *  - enter only when the fix is clearly inside (distance ≤ radius),
 *  - exit only when clearly outside (distance > radius + buffer),
 *  - never alert on the first observation (no "arrived" just because
 *    someone turned sharing on while already at home).
 */
export const EXIT_BUFFER_MIN_M = 25;

export type ZoneEvent = "enter" | "exit" | null;

export function nextZoneState(
  prevInside: boolean | undefined,
  zone: { lat: number; lng: number; radius: number },
  fix: { lat: number; lng: number; accuracy: number },
): { inside: boolean | undefined; event: ZoneEvent } {
  if (fix.accuracy > zone.radius) return { inside: prevInside, event: null }; // undecidable
  const d = distanceMeters(zone, fix);
  const buffer = Math.max(EXIT_BUFFER_MIN_M, fix.accuracy);
  const clearlyInside = d <= zone.radius;
  const clearlyOutside = d > zone.radius + buffer;

  if (prevInside === undefined) {
    if (clearlyInside) return { inside: true, event: null };
    if (clearlyOutside) return { inside: false, event: null };
    return { inside: undefined, event: null };
  }
  if (!prevInside && clearlyInside) return { inside: true, event: "enter" };
  if (prevInside && clearlyOutside) return { inside: false, event: "exit" };
  return { inside: prevInside, event: null };
}

export const ZONE_KINDS = ["home", "school", "office", "college", "custom"] as const;
export const ZONE_LIMITS = { minRadius: 50, maxRadius: 5000, maxZonesPerFamily: 20 } as const;
