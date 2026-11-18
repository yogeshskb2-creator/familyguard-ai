import "server-only";
import { cert, getApps, initializeApp, type App } from "firebase-admin/app";
import { getAuth, type Auth } from "firebase-admin/auth";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import { getMessaging, type Messaging } from "firebase-admin/messaging";

/**
 * Firebase Admin SDK — SERVER ONLY. Bypasses security rules, so every caller
 * must perform its own authorization checks before reading or writing.
 */
let adminApp: App | null = null;

function usingEmulators(): boolean {
  return Boolean(process.env.FIREBASE_AUTH_EMULATOR_HOST);
}

export function isAdminConfigured(): boolean {
  if (usingEmulators()) return Boolean(process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID);
  return Boolean(
    process.env.FIREBASE_ADMIN_PROJECT_ID &&
      process.env.FIREBASE_ADMIN_CLIENT_EMAIL &&
      process.env.FIREBASE_ADMIN_PRIVATE_KEY,
  );
}

function getAdminApp(): App {
  if (adminApp) return adminApp;
  if (!isAdminConfigured()) {
    throw new Error(
      "Firebase Admin is not configured. Set FIREBASE_ADMIN_PROJECT_ID, FIREBASE_ADMIN_CLIENT_EMAIL and FIREBASE_ADMIN_PRIVATE_KEY.",
    );
  }
  adminApp =
    getApps()[0] ??
    (usingEmulators()
      ? // Emulators accept any credentials; only the project id must match the client.
        initializeApp({ projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID })
      : initializeApp({
          credential: cert({
            projectId: process.env.FIREBASE_ADMIN_PROJECT_ID,
            clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
            privateKey: process.env.FIREBASE_ADMIN_PRIVATE_KEY!.replace(/\\n/g, "\n"),
          }),
        }));
  return adminApp;
}

export const adminAuth = (): Auth => getAuth(getAdminApp());
export const adminDb = (): Firestore => getFirestore(getAdminApp());
export const adminMessaging = (): Messaging => getMessaging(getAdminApp());
