import { readFileSync } from "node:fs";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { deleteDoc, doc, getDoc, getDocs, collection, serverTimestamp, setDoc, updateDoc } from "firebase/firestore";
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";

let env: RulesTestEnvironment;

const profile = {
  uid: "alice",
  displayName: "Alice",
  email: "alice@example.com",
  phoneNumber: null,
  photoURL: null,
  familyIds: [],
  aiProvider: "claude",
};

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: "demo-familyguard-rules",
    firestore: { rules: readFileSync("firestore.rules", "utf8") },
  });
});
afterAll(() => env.cleanup());
beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), "users/alice"), { ...profile, createdAt: new Date(), updatedAt: new Date() });
  });
});

const as = (uid: string) => env.authenticatedContext(uid).firestore();
const anon = () => env.unauthenticatedContext().firestore();

describe("users/{uid} — reads", () => {
  it("lets a user read their own profile", async () => {
    await assertSucceeds(getDoc(doc(as("alice"), "users/alice")));
  });
  it("denies unauthenticated reads", async () => {
    await assertFails(getDoc(doc(anon(), "users/alice")));
  });
  it("denies reading another user's profile", async () => {
    await assertFails(getDoc(doc(as("mallory"), "users/alice")));
  });
  it("denies listing the users collection (no directory scraping)", async () => {
    await assertFails(getDocs(collection(as("alice"), "users")));
  });
});

describe("users/{uid} — writes", () => {
  it("allows changing own displayName and aiProvider", async () => {
    await assertSucceeds(
      updateDoc(doc(as("alice"), "users/alice"), {
        displayName: "Alice S",
        aiProvider: "gemini",
        updatedAt: serverTimestamp(),
      }),
    );
  });
  it("blocks privilege escalation via a role/admin field", async () => {
    await assertFails(updateDoc(doc(as("alice"), "users/alice"), { admin: true, updatedAt: serverTimestamp() }));
    await assertFails(updateDoc(doc(as("alice"), "users/alice"), { role: "admin", updatedAt: serverTimestamp() }));
  });
  it("blocks self-joining families by editing familyIds", async () => {
    await assertFails(
      updateDoc(doc(as("alice"), "users/alice"), { familyIds: ["victim-family"], updatedAt: serverTimestamp() }),
    );
  });
  it("blocks changing email or uid", async () => {
    await assertFails(updateDoc(doc(as("alice"), "users/alice"), { email: "x@evil.test", updatedAt: serverTimestamp() }));
    await assertFails(updateDoc(doc(as("alice"), "users/alice"), { uid: "bob", updatedAt: serverTimestamp() }));
  });
  it("rejects invalid values", async () => {
    await assertFails(updateDoc(doc(as("alice"), "users/alice"), { displayName: "A", updatedAt: serverTimestamp() }));
    await assertFails(
      updateDoc(doc(as("alice"), "users/alice"), { displayName: "<script>", updatedAt: serverTimestamp() }),
    );
    await assertFails(updateDoc(doc(as("alice"), "users/alice"), { aiProvider: "skynet", updatedAt: serverTimestamp() }));
  });
  it("requires a server timestamp for updatedAt", async () => {
    await assertFails(updateDoc(doc(as("alice"), "users/alice"), { displayName: "Alice S", updatedAt: new Date(0) }));
  });
  it("denies editing another user's profile", async () => {
    await assertFails(
      updateDoc(doc(as("mallory"), "users/alice"), { displayName: "Hacked", updatedAt: serverTimestamp() }),
    );
  });
  it("denies client-side create and delete (server-managed)", async () => {
    await assertFails(setDoc(doc(as("bob"), "users/bob"), { ...profile, uid: "bob" }));
    await assertFails(deleteDoc(doc(as("alice"), "users/alice")));
  });
});

describe("collections without rules", () => {
  it("are unreachable from clients", async () => {
    for (const path of ["families/f1", "devices/d1", "devices/alice"]) {
      await assertFails(getDoc(doc(as("alice"), path)));
      await assertFails(setDoc(doc(as("alice"), path), { x: 1 }));
    }
  });
});
