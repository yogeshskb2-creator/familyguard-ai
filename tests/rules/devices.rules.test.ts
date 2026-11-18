import { readFileSync } from "node:fs";
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { collection, deleteDoc, doc, getDoc, getDocs, query, setDoc, updateDoc, where } from "firebase/firestore";
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";

let env: RulesTestEnvironment;
beforeAll(async () => {
  env = await initializeTestEnvironment({ projectId: "demo-familyguard-rules", firestore: { rules: readFileSync("firestore.rules", "utf8") } });
});
afterAll(() => env.cleanup());
beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), "devices/d1"), { ownerId: "ann", name: "Ann's phone", status: "active", pushEnabled: true, pushToken: "tok" });
    await setDoc(doc(ctx.firestore(), "_pushLog/p1"), { uid: "ann", title: "SOS" });
  });
});
const as = (uid: string) => env.authenticatedContext(uid).firestore();

describe("devices", () => {
  it("owners can read their own devices; nobody else can", async () => {
    await assertSucceeds(getDoc(doc(as("ann"), "devices/d1")));
    await assertSucceeds(getDocs(query(collection(as("ann"), "devices"), where("ownerId", "==", "ann"))));
    await assertFails(getDoc(doc(as("bob"), "devices/d1")));
    await assertFails(getDocs(collection(as("bob"), "devices")));
    await assertFails(getDocs(query(collection(as("bob"), "devices"), where("ownerId", "==", "ann"))));
  });
  it("no client writes: can't register, hijack, re-enable or plant a push token", async () => {
    await assertFails(setDoc(doc(as("ann"), "devices/d2"), { ownerId: "ann", name: "x", status: "active" }));
    await assertFails(setDoc(doc(as("bob"), "devices/d3"), { ownerId: "ann", name: "spy", status: "active" }));
    await assertFails(updateDoc(doc(as("ann"), "devices/d1"), { pushToken: "attacker-token" }));
    await assertFails(updateDoc(doc(as("bob"), "devices/d1"), { ownerId: "bob" }));
    await assertFails(deleteDoc(doc(as("ann"), "devices/d1")));
  });
  it("the emulator push log is not readable by clients", async () => {
    await assertFails(getDoc(doc(as("ann"), "_pushLog/p1")));
  });
});
