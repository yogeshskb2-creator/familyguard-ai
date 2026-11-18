import { defineConfig } from "vitest/config";
import path from "node:path";

/**
 * Service-level integration tests: real Admin SDK against the Auth +
 * Firestore emulators. Run via `npm run test:integration`.
 */
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
      "server-only": path.resolve(import.meta.dirname, "tests/integration/server-only-stub.ts"),
    },
  },
  test: {
    environment: "node",
    include: ["tests/integration/**/*.test.ts"],
    testTimeout: 20_000,
    fileParallelism: false,
    env: {
      NEXT_PUBLIC_FIREBASE_PROJECT_ID: "demo-familyguard-int",
      FIREBASE_AUTH_EMULATOR_HOST: "127.0.0.1:9099",
      FIRESTORE_EMULATOR_HOST: "127.0.0.1:8080",
    },
  },
});
