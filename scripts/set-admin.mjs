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

const { FIREBASE_ADMIN_PROJECT_ID, FIREBASE_ADMIN_CLIENT_EMAIL, FIREBASE_ADMIN_PRIVATE_KEY } = process.env;
if (!FIREBASE_ADMIN_PROJECT_ID || !FIREBASE_ADMIN_CLIENT_EMAIL || !FIREBASE_ADMIN_PRIVATE_KEY) {
  console.error("Missing FIREBASE_ADMIN_* environment variables (use --env-file=.env.local).");
  process.exit(1);
}

initializeApp({
  credential: cert({
    projectId: FIREBASE_ADMIN_PROJECT_ID,
    clientEmail: FIREBASE_ADMIN_CLIENT_EMAIL,
    privateKey: FIREBASE_ADMIN_PRIVATE_KEY.replace(/\\n/g, "\n"),
  }),
});

const auth = getAuth();
const user = await auth.getUserByEmail(email);
const claims = { ...(user.customClaims ?? {}) };
if (action === "grant") claims.admin = true;
else delete claims.admin;
await auth.setCustomUserClaims(user.uid, claims);
// Force existing sessions to re-authenticate so the new claim (or its removal) applies.
await auth.revokeRefreshTokens(user.uid);
console.log(`${action === "grant" ? "Granted" : "Revoked"} admin for ${email} (uid ${user.uid}). Existing sessions were signed out.`);
