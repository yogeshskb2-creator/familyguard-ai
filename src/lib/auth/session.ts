import "server-only";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import type { DecodedIdToken } from "firebase-admin/auth";
import { adminAuth, isAdminConfigured } from "@/lib/firebase/admin";
import { isFirebaseConfigured } from "@/lib/env";
import { SESSION_COOKIE } from "./constants";
import { safeRedirect } from "./safe-redirect";

export interface SessionUser {
  uid: string;
  email: string | null;
  emailVerified: boolean;
  displayName: string;
  phoneNumber: string | null;
  photoURL: string | null;
  signInProvider: string;
  /** From a Firebase custom claim set only via the Admin SDK — never from Firestore. */
  isAdmin: boolean;
  /** When the user last actually signed in (epoch seconds) — for re-auth checks. */
  authTime?: number;
}

export type Viewer = { mode: "preview" } | { mode: "live"; user: SessionUser };

export function toSessionUser(d: DecodedIdToken): SessionUser {
  return {
    uid: d.uid,
    email: d.email ?? null,
    emailVerified: d.email_verified === true,
    displayName: (d.name as string | undefined) ?? d.email?.split("@")[0] ?? d.phone_number ?? "Member",
    phoneNumber: d.phone_number ?? null,
    photoURL: (d.picture as string | undefined) ?? null,
    signInProvider: d.firebase.sign_in_provider,
    isAdmin: d.admin === true,
    authTime: d.auth_time,
  };
}

/** Password accounts must verify their email; Google/phone are verified by the provider. */
export function needsEmailVerification(u: Pick<SessionUser, "signInProvider" | "emailVerified">): boolean {
  return u.signInProvider === "password" && !u.emailVerified;
}

/**
 * Verify a session cookie. `checkRevoked` makes a call to Firebase so that
 * "sign out everywhere", disabled accounts and deleted accounts take effect
 * immediately instead of at cookie expiry.
 */
export async function verifySessionCookie(value: string | undefined): Promise<SessionUser | null> {
  if (!value || !isAdminConfigured()) return null;
  try {
    const decoded = await adminAuth().verifySessionCookie(value, true);
    return toSessionUser(decoded);
  } catch {
    return null;
  }
}

export async function getSessionUser(): Promise<SessionUser | null> {
  const store = await cookies();
  return verifySessionCookie(store.get(SESSION_COOKIE)?.value);
}

/**
 * Server-side gate for every protected page. In preview mode (Firebase not
 * configured) the UI renders sample data and no real data exists to protect.
 */
export async function requireViewer(nextPath?: string): Promise<Viewer> {
  if (!isFirebaseConfigured()) return { mode: "preview" };
  const user = await getSessionUser();
  if (!user) {
    const requested = nextPath ?? (await headers()).get("x-fg-pathname") ?? "/dashboard";
    redirect(`/login?next=${encodeURIComponent(safeRedirect(requested))}`);
  }
  if (needsEmailVerification(user)) redirect("/verify-email");
  return { mode: "live", user };
}
