import { readFileSync } from "node:fs";
import { assertFails, initializeTestEnvironment, type RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { collection, deleteDoc, doc, getDoc, getDocs, setDoc, updateDoc } from "firebase/firestore";
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";

let env: RulesTestEnvironment;
beforeAll(async () => {
  env = await initializeTestEnvironment({ projectId: "demo-familyguard-rules", firestore: { rules: readFileSync("firestore.rules", "utf8") } });
});
afterAll(() => env.cleanup());
beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), "securityEvents/e1"), { type: "csrf_blocked", uidHash: "abc" });
    await setDoc(doc(ctx.firestore(), "_rateLimits/r1"), { name: "sos", count: 1 });
    await setDoc(doc(ctx.firestore(), "users/ann"), { displayName: "Ann", familyIds: [] });
  });
});
const as = (uid: string, claims?: Record<string, unknown>) => env.authenticatedContext(uid, claims).firestore();

describe("server-only collections", () => {
  for (const c of ["securityEvents", "_rateLimits"]) {
    it(`${c}: no client can read or write — not even an admin`, async () => {
      for (const db of [as("ann"), as("root", { admin: true }), env.unauthenticatedContext().firestore()]) {
        await assertFails(getDoc(doc(db, `${c}/${c === "securityEvents" ? "e1" : "r1"}`)));
        await assertFails(getDocs(collection(db, c)));
        await assertFails(setDoc(doc(db, `${c}/new`), { x: 1 }));
        await assertFails(deleteDoc(doc(db, `${c}/${c === "securityEvents" ? "e1" : "r1"}`)));
      }
    });
  }
  it("a user can't clear their own rate-limit counter", async () => {
    await assertFails(updateDoc(doc(as("ann"), "_rateLimits/r1"), { count: 0 }));
  });
});

describe("privilege escalation", () => {
  it("nobody can make themselves an admin through their profile", async () => {
    await assertFails(updateDoc(doc(as("ann"), "users/ann"), { admin: true }));
    await assertFails(updateDoc(doc(as("ann"), "users/ann"), { role: "admin" }));
    await assertFails(setDoc(doc(as("ann"), "users/ann"), { displayName: "Ann", isAdmin: true }));
  });
  it("collections without a rule are denied by default", async () => {
    await assertFails(getDoc(doc(as("ann", { admin: true }), "anything/x")));
    await assertFails(setDoc(doc(as("ann"), "anything/x"), { a: 1 }));
  });
});
