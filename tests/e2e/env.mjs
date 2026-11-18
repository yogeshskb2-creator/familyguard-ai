/** Demo config for the Firebase Emulator Suite. "demo-" projects never touch real Firebase. */
export const PROJECT_ID = "demo-familyguard";
export const PORT = 3200;
export const BASE = `http://localhost:${PORT}`;
export const AUTH_EMU = "http://127.0.0.1:9099";
export const FS_EMU = "http://127.0.0.1:8080";

export const e2eEnv = {
  NEXT_PUBLIC_FIREBASE_API_KEY: "demo-api-key",
  NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: "localhost",
  NEXT_PUBLIC_FIREBASE_PROJECT_ID: PROJECT_ID,
  NEXT_PUBLIC_FIREBASE_APP_ID: "1:000000000000:web:demo",
  NEXT_PUBLIC_USE_FIREBASE_EMULATORS: "true",
  FIREBASE_AUTH_EMULATOR_HOST: "127.0.0.1:9099",
  FIRESTORE_EMULATOR_HOST: "127.0.0.1:8080",
  NEXT_DIST_DIR: ".next-e2e",
  // Deliberately invalid: the real Google Maps loader runs and rejects it,
  // proving the app detects bad keys and falls back instead of a blank map.
  NEXT_PUBLIC_GOOGLE_MAPS_API_KEY: "e2e-invalid-maps-key",
  // Deliberately FAKE server-side AI keys: the real SDKs call the real APIs and
  // get rejected, proving the wiring + safe error handling (no real spend).
  ANTHROPIC_API_KEY: "sk-ant-e2e-fake-key-not-real-000",
  OPENAI_API_KEY: "sk-e2e-fake-openai-key-not-real",
  GEMINI_API_KEY: "e2e-fake-gemini-key-not-real",
};
