/**
 * Central, typed access to environment configuration.
 *
 * Public (NEXT_PUBLIC_*) values must be referenced literally so Next.js can
 * inline them at build time — do not refactor into dynamic `process.env[key]`.
 */
export const publicEnv = {
  firebase: {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY ?? "",
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN ?? "",
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? "",
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ?? "",
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID ?? "",
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID ?? "",
  },
  vapidKey: process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY ?? "",
  mapsApiKey: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? "",
  mapsMapId: process.env.NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID ?? "",
  appUrl: process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
  /** Local development/testing against the Firebase Emulator Suite. Never enable in production. */
  useEmulators: process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATORS === "true",
} as const;

export type FirebaseWebConfig = typeof publicEnv.firebase;

const REQUIRED_FIREBASE_KEYS = ["apiKey", "authDomain", "projectId", "appId"] as const;

/** Returns the names of required Firebase web-config values that are missing. */
export function missingFirebaseConfig(config: FirebaseWebConfig = publicEnv.firebase): string[] {
  return REQUIRED_FIREBASE_KEYS.filter((k) => !config[k]?.trim());
}

export function isFirebaseConfigured(config: FirebaseWebConfig = publicEnv.firebase): boolean {
  return missingFirebaseConfig(config).length === 0;
}

export function isMapsConfigured(): boolean {
  return publicEnv.mapsApiKey.trim().length > 0;
}
