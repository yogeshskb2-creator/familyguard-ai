import type { NextConfig } from "next";
import { buildCsp } from "./src/lib/security/csp";

/**
 * Security headers applied to every route.
 * - geolocation=(self): only our own origin may request location, and only
 *   after the browser shows its permission prompt to the user.
 * - camera/microphone are disabled entirely; the app never needs them.
 */
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "geolocation=(self), camera=(), microphone=(), payment=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin-allow-popups" },
  {
    key: "Content-Security-Policy",
    value: buildCsp({
      authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
      emulators: process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATORS === "true",
      dev: process.env.NODE_ENV !== "production",
    }),
  },
];

const nextConfig: NextConfig = {
  // Lets the emulator E2E build live beside the normal build (see tests/e2e).
  distDir: process.env.NEXT_DIST_DIR || ".next",
  reactStrictMode: true,
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
