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
    await setDoc(doc(db, "users/ann"), { familyIds: ["fam1"] });
    await setDoc(doc(db, "users/bob"), { familyIds: ["fam1"] });
    await setDoc(doc(db, "users/eve"), { familyIds: ["fam2"] });
    await setDoc(doc(db, "families/fam1"), { memberIds: ["ann", "bob"], members: { ann: { role: "owner" }, bob: { role: "member" } } });
    await setDoc(doc(db, "families/fam1/events/e1"), { type: "sos", uid: "ann" });
    await setDoc(doc(db, "emergencyAlerts/a1"), { uid: "ann", familyIds: ["fam1"], status: "active", lat: 1, lng: 2 });
    await setDoc(doc(db, "geofences/z1"), { familyId: "fam1", name: "Home", lat: 1, lng: 2, radius: 100 });
    await setDoc(doc(db, "notifications/bob/items/n1"), { title: "SOS", read: false, kind: "sos" });
  });
});

const as = (uid: string) => env.authenticatedContext(uid).firestore();

describe("emergencyAlerts", () => {
  it("sender and alerted family members can read; outsiders cannot", async () => {
    await assertSucceeds(getDoc(doc(as("ann"), "emergencyAlerts/a1")));
    await assertSucceeds(getDoc(doc(as("bob"), "emergencyAlerts/a1")));
    await assertFails(getDoc(doc(as("eve"), "emergencyAlerts/a1")));
  });
  it("nobody can create, forge, resolve or delete alerts from the client", async () => {
    await assertFails(setDoc(doc(as("ann"), "emergencyAlerts/a2"), { uid: "ann", familyIds: ["fam1"], status: "active" }));
    await assertFails(setDoc(doc(as("eve"), "emergencyAlerts/a3"), { uid: "ann", familyIds: ["fam1"], status: "active" }));
    await assertFails(updateDoc(doc(as("bob"), "emergencyAlerts/a1"), { status: "resolved" }));
    await assertFails(deleteDoc(doc(as("ann"), "emergencyAlerts/a1")));
    await assertFails(getDocs(collection(as("ann"), "emergencyAlerts")));
  });
});

describe("geofences", () => {
  it("family members can view zones; outsiders cannot", async () => {
    await assertSucceeds(getDoc(doc(as("bob"), "geofences/z1")));
    await assertFails(getDoc(doc(as("eve"), "geofences/z1")));
  });
  it("zones can't be created or moved from the client (even by the owner)", async () => {
    await assertFails(setDoc(doc(as("ann"), "geofences/z2"), { familyId: "fam1", name: "X", lat: 0, lng: 0, radius: 100 }));
    await assertFails(updateDoc(doc(as("ann"), "geofences/z1"), { radius: 5000 }));
  });
});

describe("family events", () => {
  it("members only, read-only", async () => {
    await assertSucceeds(getDocs(collection(as("bob"), "families/fam1/events")));
    await assertFails(getDocs(collection(as("eve"), "families/fam1/events")));
    await assertFails(setDoc(doc(as("ann"), "families/fam1/events/e2"), { type: "geofence_enter", uid: "bob" }));
  });
});

describe("notifications inbox", () => {
  it("only the owner can read it", async () => {
    await assertSucceeds(getDocs(collection(as("bob"), "notifications/bob/items")));
    await assertFails(getDocs(collection(as("ann"), "notifications/bob/items")));
  });
  it("the owner may only flip `read`", async () => {
    await assertSucceeds(updateDoc(doc(as("bob"), "notifications/bob/items/n1"), { read: true }));
    await assertFails(updateDoc(doc(as("bob"), "notifications/bob/items/n1"), { title: "edited" }));
    await assertFails(updateDoc(doc(as("bob"), "notifications/bob/items/n1"), { read: "yes" }));
  });
  it("nobody can plant or delete notifications (no fake SOS / phishing)", async () => {
    await assertFails(setDoc(doc(as("ann"), "notifications/bob/items/fake"), { title: "🚨 SOS — click here", read: false }));
    await assertFails(setDoc(doc(as("bob"), "notifications/bob/items/own"), { title: "x", read: false }));
    await assertFails(deleteDoc(doc(as("ann"), "notifications/bob/items/n1")));
  });
});
