import { z } from "zod";
import { authed } from "@/lib/api/handler";
import { FamilyError } from "@/lib/families/errors";
import { GeocodeError, describePoint, searchPlaces } from "@/lib/location/geocode.server";
import { createRateLimiter } from "@/lib/rate-limit";

export const runtime = "nodejs";

const limiter = createRateLimiter({ limit: 20, windowMs: 60_000 });

const searchSchema = z.object({ q: z.string().trim().min(3, "Type at least 3 letters").max(120) });
const pointSchema = z.object({ lat: z.coerce.number().min(-90).max(90), lng: z.coerce.number().min(-180).max(180) });

/**
 * Place search for the safe-zone form (signed-in users only).
 *   GET /api/geocode?q=Shikohabad station  → { places }
 *   GET /api/geocode?lat=27.1&lng=78.58     → { place }
 */
export const GET = authed(async ({ req, user }) => {
  if (!limiter(`geo:${user.uid}`).ok) throw new FamilyError(429, "rate_limited", "Too many searches. Wait a minute and try again.");
  const sp = req.nextUrl.searchParams;
  try {
    if (sp.has("q")) {
      const parsed = searchSchema.safeParse({ q: sp.get("q") });
      if (!parsed.success) throw new FamilyError(400, "invalid", parsed.error.issues[0]?.message ?? "Invalid search");
      return { places: await searchPlaces(parsed.data.q) };
    }
    if (!sp.has("lat") || !sp.has("lng")) throw new FamilyError(400, "invalid", "Give a search text or a point.");
    const parsed = pointSchema.safeParse({ lat: sp.get("lat"), lng: sp.get("lng") });
    if (!parsed.success) throw new FamilyError(400, "invalid", "Invalid point");
    return { place: await describePoint(parsed.data.lat, parsed.data.lng) };
  } catch (e) {
    if (e instanceof GeocodeError) throw new FamilyError(503, "geocode_unavailable", e.message);
    throw e;
  }
});
