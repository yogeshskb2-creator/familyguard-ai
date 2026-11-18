/** `__session` is the only cookie Firebase Hosting forwards to backends. */
export const SESSION_COOKIE = "__session";
export const SESSION_MAX_AGE_MS = 5 * 24 * 60 * 60 * 1000; // 5 days
/** Session cookies may only be minted from a sign-in this recent. */
export const RECENT_SIGN_IN_SEC = 5 * 60;
/** Routes that need a session. Checked in middleware AND verified server-side. */
export const PROTECTED_PREFIXES = [
  "/dashboard",
  "/map",
  "/family",
  "/sos",
  "/geofences",
  "/assistant",
  "/devices",
  "/notifications",
  "/settings",
  "/admin",
];
