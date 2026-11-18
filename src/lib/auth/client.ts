"use client";

import {
  GoogleAuthProvider,
  RecaptchaVerifier,
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPhoneNumber,
  signInWithPopup,
  signOut as firebaseSignOut,
  updateProfile,
  type ConfirmationResult,
  type User,
} from "firebase/auth";
import { getClientAuth } from "@/lib/firebase/client";
import { AuthFlowError } from "./errors";

function requireAuth() {
  const auth = getClientAuth();
  if (!auth) throw new AuthFlowError("Firebase is not configured for this deployment.", "not_configured");
  return auth;
}

function continueUrl(path: string) {
  return { url: `${window.location.origin}${path}` };
}

/** Exchange the user's fresh ID token for the server's httpOnly session cookie. */
export async function establishSession(user: User): Promise<void> {
  const idToken = await user.getIdToken(true);
  const res = await fetch("/api/auth/session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ idToken }),
    credentials: "same-origin",
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: { code: string; message: string } } | null;
    throw new AuthFlowError(body?.error?.message ?? "Sign-in failed.", body?.error?.code ?? "session_failed");
  }
}

export type SignInOutcome = { status: "signed_in" } | { status: "verify_email" };

export async function registerWithEmail(input: { displayName: string; email: string; password: string }) {
  const auth = requireAuth();
  const cred = await createUserWithEmailAndPassword(auth, input.email, input.password);
  await updateProfile(cred.user, { displayName: input.displayName });
  await sendEmailVerification(cred.user, continueUrl("/verify-email"));
  return cred.user;
}

export async function signInWithEmail(email: string, password: string): Promise<SignInOutcome> {
  const cred = await signInWithEmailAndPassword(requireAuth(), email, password);
  if (!cred.user.emailVerified) return { status: "verify_email" };
  await establishSession(cred.user);
  return { status: "signed_in" };
}

export async function signInWithGoogle(): Promise<SignInOutcome> {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });
  const cred = await signInWithPopup(requireAuth(), provider);
  await establishSession(cred.user);
  return { status: "signed_in" };
}

let recaptcha: RecaptchaVerifier | null = null;

/** Sends an SMS code. `containerId` is an element that hosts the invisible reCAPTCHA. */
export async function startPhoneSignIn(phoneE164: string, containerId: string): Promise<ConfirmationResult> {
  const auth = requireAuth();
  recaptcha?.clear();
  recaptcha = new RecaptchaVerifier(auth, containerId, { size: "invisible" });
  try {
    return await signInWithPhoneNumber(auth, phoneE164, recaptcha);
  } catch (err) {
    recaptcha.clear();
    recaptcha = null;
    throw err;
  }
}

export async function confirmPhoneCode(confirmation: ConfirmationResult, code: string): Promise<SignInOutcome> {
  const cred = await confirmation.confirm(code);
  await establishSession(cred.user);
  return { status: "signed_in" };
}

/** Always resolves for unknown emails so the UI can't be used to probe accounts. */
export async function requestPasswordReset(email: string): Promise<void> {
  try {
    await sendPasswordResetEmail(requireAuth(), email, continueUrl("/login"));
  } catch (err) {
    const code = (err as { code?: string }).code;
    if (code === "auth/user-not-found" || code === "auth/invalid-email") return;
    throw err;
  }
}

export async function resendVerificationEmail(): Promise<void> {
  const user = requireAuth().currentUser;
  if (!user) throw new AuthFlowError("Sign in again to resend the email.", "no_user");
  await sendEmailVerification(user, continueUrl("/verify-email"));
}

/** Reload the user; if their email is now verified, start a session. */
export async function completeEmailVerification(): Promise<"verified" | "pending"> {
  const user = requireAuth().currentUser;
  if (!user) throw new AuthFlowError("Sign in again to continue.", "no_user");
  await user.reload();
  if (!user.emailVerified) return "pending";
  await establishSession(user);
  return "verified";
}

/** Clears the server session (optionally on every device) and the client SDK state. */
export async function signOut({ everywhere = false } = {}): Promise<void> {
  await fetch(`/api/auth/session${everywhere ? "?scope=all" : ""}`, {
    method: "DELETE",
    credentials: "same-origin",
  }).catch(() => undefined);
  const auth = getClientAuth();
  if (auth) await firebaseSignOut(auth);
}

export function subscribeToAuth(cb: (user: User | null) => void): () => void {
  const auth = getClientAuth();
  if (!auth) {
    cb(null);
    return () => undefined;
  }
  return onAuthStateChanged(auth, cb);
}
