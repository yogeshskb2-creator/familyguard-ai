import "server-only";

/*
 * Place search for the safe-zone form, via OpenStreetMap's Nominatim.
 * Called from our server (never the browser) so we can identify ourselves
 * as their usage policy requires, stay under 1 request/second, and cache.
 * Data © OpenStreetMap contributors (ODbL); the form shows the credit.
 * https://operations.osmfoundation.org/policies/nominatim/
 */

const BASE = "https://nominatim.openstreetmap.org";
const USER_AGENT = "FamilyGuardAI/1.0 (safe-zone place search; https://familyguard-ai-pi.vercel.app)";
const TIMEOUT_MS = 6000;

export interface Place {
  name: string;
  address: string;
  lat: number;
  lng: number;
}

export class GeocodeError extends Error {}

// Best-effort 1 request/second per server instance (the policy's limit).
let nextSlot = 0;
async function throttle() {
  const now = Date.now();
  const wait = Math.max(0, nextSlot - now);
  nextSlot = Math.max(now, nextSlot) + 1000;
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
}

const cache = new Map<string, { at: number; value: unknown }>();
const CACHE_MS = 24 * 60 * 60 * 1000;

async function get<T>(path: string, params: Record<string, string>): Promise<T> {
  const url = `${BASE}${path}?${new URLSearchParams({ format: "jsonv2", "accept-language": "en,hi", ...params })}`;
  const hit = cache.get(url);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.value as T;
  await throttle();
  let res: Response;
  try {
    res = await fetch(url, { headers: { "User-Agent": USER_AGENT, Accept: "application/json" }, signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch {
    throw new GeocodeError("Place search isn't reachable right now. Try again, or use your current location.");
  }
  if (!res.ok) throw new GeocodeError("Place search is busy right now. Try again in a moment.");
  const value = (await res.json()) as T;
  if (cache.size > 2000) cache.clear();
  cache.set(url, { at: Date.now(), value });
  return value;
}

interface NominatimPlace {
  lat: string;
  lon: string;
  name?: string;
  display_name?: string;
}

function toPlace(p: NominatimPlace): Place | null {
  const lat = Number(p.lat);
  const lng = Number(p.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const address = (p.display_name ?? "").slice(0, 200);
  const name = (p.name || address.split(",")[0] || "Selected place").slice(0, 80);
  return { name, address, lat, lng };
}

/** Up to 6 places matching free text, e.g. "Shikohabad railway station". */
export async function searchPlaces(query: string): Promise<Place[]> {
  const results = await get<NominatimPlace[]>("/search", { q: query, limit: "6", addressdetails: "0" });
  return (Array.isArray(results) ? results : []).map(toPlace).filter((p): p is Place => p !== null);
}

/** Human-readable address for a point, or null if there's nothing there. */
export async function describePoint(lat: number, lng: number): Promise<Place | null> {
  const r = await get<NominatimPlace & { error?: string }>("/reverse", { lat: lat.toFixed(5), lon: lng.toFixed(5), zoom: "17" });
  return r && !r.error ? toPlace(r) : null;
}
