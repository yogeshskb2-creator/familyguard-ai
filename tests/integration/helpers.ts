import { expect } from "vitest";
import type { SessionUser } from "@/lib/auth/session";
import { adminAuth } from "@/lib/firebase/admin";
import { FamilyError } from "@/lib/families/errors";
import { ensureUserProfile } from "@/lib/users/profile.server";

const PROJECT = "demo-familyguard-int";

export async function wipe() {
  await fetch(`http://127.0.0.1:8080/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, { method: "DELETE" });
  await fetch(`http://127.0.0.1:9099/emulator/v1/projects/${PROJECT}/accounts`, { method: "DELETE" });
}

let n = 0;
export async function makeUser(displayName: string): Promise<SessionUser> {
  n++;
  const email = `u${n}.${Date.now()}@example.com`;
  const r = await adminAuth().createUser({ email, emailVerified: true, displayName });
  const user: SessionUser = {
    uid: r.uid,
    email,
    emailVerified: true,
    displayName,
    phoneNumber: null,
    photoURL: null,
    signInProvider: "password",
    isAdmin: false,
  };
  await ensureUserProfile(user);
  return user;
}

export async function expectError(p: Promise<unknown>, status: number, code?: string) {
  const err = await p.then(
    () => null,
    (e) => e,
  );
  expect(err, "expected the call to be rejected").toBeInstanceOf(FamilyError);
  expect(err.status).toBe(status);
  if (code) expect(err.code).toBe(code);
}
