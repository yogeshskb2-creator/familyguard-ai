#!/usr/bin/env node
/**
 * Runs before `next build` on Vercel production deploys: publishes
 * firestore.rules and firestore.indexes.json to the Firebase project, using
 * the FIREBASE_SERVICE_ACCOUNT key already configured for the server.
 *
 * Best-effort: it never fails the build. It skips itself when there is no
 * key or when this is not a production deploy, and logs the outcome either way
 * so it can be checked in the Vercel build log.
 */
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const tag = "[firestore-deploy]";
const raw = process.env.FIREBASE_SERVICE_ACCOUNT?.trim();
const env = process.env.VERCEL_ENV;

if (!raw) {
  console.log(`${tag} skipped: FIREBASE_SERVICE_ACCOUNT is not set.`);
  process.exit(0);
}
if (env && env !== "production") {
  console.log(`${tag} skipped: ${env} deploy (rules and indexes are published from production only).`);
  process.exit(0);
}

let projectId;
try {
  projectId = JSON.parse(raw).project_id;
} catch {
  console.log(`${tag} skipped: FIREBASE_SERVICE_ACCOUNT is not valid JSON.`);
  process.exit(0);
}

const dir = mkdtempSync(join(tmpdir(), "fg-sa-"));
const keyFile = join(dir, "key.json");
writeFileSync(keyFile, raw, { mode: 0o600 });
try {
  const r = spawnSync(
    "npx",
    ["firebase", "deploy", "--only", "firestore:rules,firestore:indexes", "--project", projectId, "--non-interactive"],
    { stdio: "inherit", env: { ...process.env, GOOGLE_APPLICATION_CREDENTIALS: keyFile } },
  );
  console.log(r.status === 0 ? `${tag} OK: rules and indexes published to ${projectId}.` : `${tag} FAILED (exit ${r.status}); the build continues.`);
} finally {
  rmSync(dir, { recursive: true, force: true });
}
