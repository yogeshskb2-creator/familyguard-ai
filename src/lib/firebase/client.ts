"use client";

import { getApp, getApps, initializeApp, type FirebaseApp } from "firebase/app";
import { connectAuthEmulator, getAuth, type Auth } from "firebase/auth";
import { connectFirestoreEmulator, getFirestore, type Firestore } from "firebase/firestore";
import { isFirebaseConfigured, publicEnv } from "@/lib/env";

let app: FirebaseApp | null = null;
let auth: Auth | null = null;
let db: Firestore | null = null;

/**
 * Lazily initialise the Firebase client SDK.
 * Returns null when the project has not been configured yet, so the UI can
 * render a setup notice instead of crashing.
 */
export function getFirebaseApp(): FirebaseApp | null {
  if (!isFirebaseConfigured()) return null;
  if (app) return app;
  app = getApps().length ? getApp() : initializeApp(publicEnv.firebase);
  return app;
}

export function getClientAuth(): Auth | null {
  if (auth) return auth;
  const a = getFirebaseApp();
  if (!a) return null;
  auth = getAuth(a);
  if (publicEnv.useEmulators) {
    connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
  }
  return auth;
}

export function getClientDb(): Firestore | null {
  if (db) return db;
  const a = getFirebaseApp();
  if (!a) return null;
  db = getFirestore(a);
  if (publicEnv.useEmulators) connectFirestoreEmulator(db, "127.0.0.1", 8080);
  return db;
}
