import { authed } from "@/lib/api/handler";
import { FamilyError } from "@/lib/families/errors";
import { markLocationFromDevice } from "@/lib/devices/service.server";
import { recordLocation } from "@/lib/location/service.server";
import { locationUpdateSchema } from "@/lib/location/validation";
import { createRateLimiter } from "@/lib/rate-limit";

export const runtime = "nodejs";

/** Clients send at most every 15 s; allow some slack for retries. */
const limiter = createRateLimiter({ limit: 8, windowMs: 60_000 });

/** Post a location fix. Refused (409 not_sharing) unless consent is active. */
export const POST = authed(async ({ user, body }) => {
  if (!limiter(`loc:${user.uid}`).ok) throw new FamilyError(429, "rate_limited", "Location updates are too frequent.");
  const { deviceId, ...fix } = await body(locationUpdateSchema);
  const location = await recordLocation(user, fix);
  if (deviceId) await markLocationFromDevice(user.uid, deviceId); // only updates the caller's OWN device
  return { location };
});
