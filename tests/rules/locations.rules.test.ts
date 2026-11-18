import { readFileSync } from "node:fs";
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { collection, deleteDoc, doc, getDoc, getDocs, setDoc, updateDoc } from "firebase/firestore";
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";

let env: RulesTestEnvironment;

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
    const db = ctx.firestore();
    // ann is in fam1 and fam2; bob in fam1; cat in fam2; eve in none.
    await setDoc(doc(db, "users/ann"), { familyIds: ["fam1", "fam2"] });
    await setDoc(doc(db, "users/bob"), { familyIds: ["fam1"] });
    await setDoc(doc(db, "users/cat"), { familyIds: ["fam2"] });
    await setDoc(doc(db, "users/eve"), { familyIds: [] });
    // ann shares with fam1 only.
    await setDoc(doc(db, "locations/ann"), { lat: 12.9, lng: 77.6, accuracy: 10, sharedWith: ["fam1"] });
    await setDoc(doc(db, "locationHistory/ann/points/p1"), { lat: 12.9, lng: 77.6 });
  });
});

const as = (uid: string) => env.authenticatedContext(uid).firestore();

describe("locations/{uid}", () => {
  it("the owner can read their own location", async () => {
    await assertSucceeds(getDoc(doc(as("ann"), "locations/ann")));
  });
  it("a member of a family it is shared with can read it", async () => {
    await assertSucceeds(getDoc(doc(as("bob"), "locations/ann")));
  });
  it("a co-member of a family NOT chosen by the sharer cannot", async () => {
    await assertFails(getDoc(doc(as("cat"), "locations/ann")));
  });
  it("outsiders and anonymous users cannot", async () => {
    await assertFails(getDoc(doc(as("eve"), "locations/ann")));
    await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), "locations/ann")));
  });
  it("access ends immediately when the viewer leaves the family", async () => {
    await env.withSecurityRulesDisabled((ctx) => updateDoc(doc(ctx.firestore(), "users/bob"), { familyIds: [] }));
    await assertFails(getDoc(doc(as("bob"), "locations/ann")));
  });
  it("nobody can list all locations", async () => {
    await assertFails(getDocs(collection(as("ann"), "locations")));
  });
  it("clients can't write locations — not even their own (consent is checked server-side)", async () => {
    await assertFails(setDoc(doc(as("ann"), "locations/ann"), { lat: 1, lng: 1, accuracy: 5, sharedWith: ["fam1"] }));
    await assertFails(updateDoc(doc(as("ann"), "locations/ann"), { sharedWith: ["fam1", "fam2"] }));
    await assertFails(setDoc(doc(as("eve"), "locations/eve"), { lat: 1, lng: 1, sharedWith: ["fam1"] }));
    await assertFails(deleteDoc(doc(as("bob"), "locations/ann")));
  });
});

describe("locationHistory/{uid}/points", () => {
  it("only the owner can read history — family members cannot", async () => {
    await assertSucceeds(getDoc(doc(as("ann"), "locationHistory/ann/points/p1")));
    await assertSucceeds(getDocs(collection(as("ann"), "locationHistory/ann/points")));
    await assertFails(getDoc(doc(as("bob"), "locationHistory/ann/points/p1")));
    await assertFails(getDocs(collection(as("bob"), "locationHistory/ann/points")));
  });
  it("history can't be written or forged by clients", async () => {
    await assertFails(setDoc(doc(as("ann"), "locationHistory/ann/points/p2"), { lat: 0, lng: 0 }));
    await assertFails(deleteDoc(doc(as("ann"), "locationHistory/ann/points/p1")));
  });
});

describe("users/{uid}.sharing consent", () => {
  it("users can't flip their own consent or sharing families from the client", async () => {
    await assertFails(updateDoc(doc(as("ann"), "users/ann"), { "sharing.active": true }));
    await assertFails(updateDoc(doc(as("ann"), "users/ann"), { familyIds: ["fam1", "fam2", "victim"] }));
  });
});
