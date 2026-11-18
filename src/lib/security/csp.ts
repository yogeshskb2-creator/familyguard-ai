/**
 * Content-Security-Policy for every page. Pure function (no imports) so
 * next.config.ts and unit tests can share it.
 *
 * Allowed origins and why:
 * - Firebase Auth/Firestore/FCM and Google Maps APIs: *.googleapis.com
 * - Google Maps tiles/scripts: maps.gstatic.com, *.ggpht.com, *.googleusercontent.com
 * - Google sign-in popup & reCAPTCHA: apis.google.com, www.google.com, www.gstatic.com,
 *   and the Firebase auth domain (iframe used by signInWithPopup)
 * - Emulators (development/E2E only): 127.0.0.1:9099 and :8080
 *
 * 'unsafe-inline' for scripts is required by Next.js' inline bootstrap
 * without per-request nonces; 'unsafe-eval' is required by the Google Maps
 * JS API (per Google's CSP guide) and by Next.js in development. Everything
 * else is locked down: no plugins, no framing, no foreign form targets.
 */
export function buildCsp(opts: { authDomain?: string; emulators?: boolean; dev?: boolean } = {}): string {
  const authOrigin = opts.authDomain && opts.authDomain !== "localhost" ? `https://${opts.authDomain}` : "";
  const emu = opts.emulators ? "http://127.0.0.1:9099 http://127.0.0.1:8080 ws://127.0.0.1:8080 http://localhost:9099 http://localhost:8080" : "";
  const google = "https://*.googleapis.com https://*.gstatic.com https://*.google.com https://*.ggpht.com https://*.googleusercontent.com";
  const d: Record<string, string> = {
    "default-src": "'self'",
    "script-src": `'self' 'unsafe-inline' 'unsafe-eval' blob: https://apis.google.com https://maps.googleapis.com https://maps.gstatic.com https://www.google.com https://www.gstatic.com`,
    "style-src": "'self' 'unsafe-inline' https://fonts.googleapis.com",
    "img-src": `'self' data: blob: ${google}`,
    "font-src": "'self' data: https://fonts.gstatic.com",
    "connect-src": `'self' ${google} https://*.firebaseio.com wss://*.firebaseio.com https://firebaseinstallations.googleapis.com https://fcmregistrations.googleapis.com ${emu}`,
    "frame-src": `'self' https://apis.google.com https://www.google.com https://recaptcha.google.com ${authOrigin} https://*.firebaseapp.com`,
    "worker-src": "'self' blob:",
    "manifest-src": "'self'",
    "object-src": "'none'",
    "base-uri": "'self'",
    "form-action": "'self'",
    "frame-ancestors": "'none'",
  };
  if (!opts.dev && !opts.emulators) d["upgrade-insecure-requests"] = "";
  return Object.entries(d)
    .map(([k, v]) => `${k} ${v}`.replace(/\s+/g, " ").trim())
    .join("; ");
}
