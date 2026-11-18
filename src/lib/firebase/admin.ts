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

export interface ServiceAccount {
  projectId: string;
  clientEmail: string;
  privateKey: string;
}

/**
 * Service-account credentials, from either:
 * - FIREBASE_SERVICE_ACCOUNT: the whole JSON key file pasted as one value
 *   (simplest: open the downloaded file, copy everything, paste), or
 * - FIREBASE_ADMIN_PROJECT_ID / _CLIENT_EMAIL / _PRIVATE_KEY separately.
 * Returns null when neither is complete or the JSON is malformed.
 */
export function readServiceAccount(env: Record<string, string | undefined> = process.env): ServiceAccount | null {
  const json = env.FIREBASE_SERVICE_ACCOUNT?.trim();
  if (json) {
    try {
      const sa = JSON.parse(json) as { project_id?: string; client_email?: string; private_key?: string };
      if (sa.project_id && sa.client_email && sa.private_key) {
        return { projectId: sa.project_id, clientEmail: sa.client_email, privateKey: sa.private_key.replace(/\\n/g, "\n") };
      }
    } catch {
      /* fall through to the separate variables */
    }
  }
  const { FIREBASE_ADMIN_PROJECT_ID: projectId, FIREBASE_ADMIN_CLIENT_EMAIL: clientEmail, FIREBASE_ADMIN_PRIVATE_KEY: key } = env;
  if (projectId && clientEmail && key) return { projectId, clientEmail, privateKey: key.replace(/\\n/g, "\n") };
  return null;
}

export function isAdminConfigured(): boolean {
  if (usingEmulators()) return Boolean(process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID);
  return readServiceAccount() !== null;
}

function getAdminApp(): App {
  if (adminApp) return adminApp;
  if (!isAdminConfigured()) {
    throw new Error(
      "Firebase Admin is not configured. Set FIREBASE_SERVICE_ACCOUNT (the whole key file) or FIREBASE_ADMIN_PROJECT_ID, FIREBASE_ADMIN_CLIENT_EMAIL and FIREBASE_ADMIN_PRIVATE_KEY.",
    );
  }
  adminApp =
    getApps()[0] ??
    (usingEmulators()
      ? // Emulators accept any credentials; only the project id must match the client.
        initializeApp({ projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID })
      : initializeApp({ credential: cert(readServiceAccount()!) }));
  return adminApp;
}

export const adminAuth = (): Auth => getAuth(getAdminApp());
export const adminDb = (): Firestore => getFirestore(getAdminApp());
export const adminMessaging = (): Messaging => getMessaging(getAdminApp());
