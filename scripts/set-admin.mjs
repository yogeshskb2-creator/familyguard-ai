#!/usr/bin/env node
/**
 * Grant or revoke FamilyGuard administrator access.
 *
 * Admin rights are a Firebase Auth custom claim, settable ONLY with service-
 * account credentials — no user can grant it to themselves through the app.
 *
 *   node --env-file=.env.local scripts/set-admin.mjs grant  person@example.com
 *   node --env-file=.env.local scripts/set-admin.mjs revoke person@example.com
 *
 * The user must sign out and in again for the change to reach their session.
 */
import { cert, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";

const [action, email] = process.argv.slice(2);
if (!["grant", "revoke"].includes(action) || !email) {
  console.error("Usage: set-admin.mjs <grant|revoke> <email>");
  process.exit(1);
}

let sa = null;
if (process.env.FIREBASE_SERVICE_ACCOUNT) {
  const j = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
  sa = { projectId: j.project_id, clientEmail: j.client_email, privateKey: j.private_key };
} else if (process.env.FIREBASE_ADMIN_PROJECT_ID && process.env.FIREBASE_ADMIN_CLIENT_EMAIL && process.env.FIREBASE_ADMIN_PRIVATE_KEY) {
  sa = {
    projectId: process.env.FIREBASE_ADMIN_PROJECT_ID,
    clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
    privateKey: process.env.FIREBASE_ADMIN_PRIVATE_KEY,
  };
}
if (!sa) {
  console.error("Missing FIREBASE_SERVICE_ACCOUNT or FIREBASE_ADMIN_* environment variables (use --env-file=.env.local).");
  process.exit(1);
}

initializeApp({ credential: cert({ ...sa, privateKey: sa.privateKey.replace(/\\n/g, "\n") }) });

const auth = getAuth();
const user = await auth.getUserByEmail(email);
const claims = { ...(user.customClaims ?? {}) };
if (action === "grant") claims.admin = true;
else delete claims.admin;
await auth.setCustomUserClaims(user.uid, claims);
// Force existing sessions to re-authenticate so the new claim (or its removal) applies.
await auth.revokeRefreshTokens(user.uid);
console.log(`${action === "grant" ? "Granted" : "Revoked"} admin for ${email} (uid ${user.uid}). Existing sessions were signed out.`);
