import { readFileSync } from "node:fs";
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { collection, deleteDoc, doc, getDoc, getDocs, query, setDoc, updateDoc, where } from "firebase/firestore";
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
    await setDoc(doc(db, "families/fam1"), {
      name: "Sharma",
      ownerId: "owner",
      memberIds: ["owner", "guard", "kid"],
      members: {
        owner: { uid: "owner", role: "owner" },
        guard: { uid: "guard", role: "guardian" },
        kid: { uid: "kid", role: "member" },
      },
    });
    await setDoc(doc(db, "familyInvitations/inv1"), {
      familyId: "fam1",
      inviteeEmail: "new@example.com",
      inviteePhone: null,
      role: "member",
      status: "pending",
    });
    await setDoc(doc(db, "familyInvitations/inv2"), {
      familyId: "fam1",
      inviteeEmail: null,
      inviteePhone: "+15550001111",
      role: "member",
      status: "pending",
    });
  });
});

const as = (uid: string, claims: Record<string, unknown> = {}) => env.authenticatedContext(uid, claims).firestore();

describe("families/{familyId}", () => {
  it("members can read their family", async () => {
    for (const uid of ["owner", "guard", "kid"]) await assertSucceeds(getDoc(doc(as(uid), "families/fam1")));
  });
  it("non-members and anonymous users cannot", async () => {
    await assertFails(getDoc(doc(as("stranger"), "families/fam1")));
    await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), "families/fam1")));
  });
  it("membership-filtered queries work; unfiltered queries are denied", async () => {
    await assertSucceeds(getDocs(query(collection(as("kid"), "families"), where("memberIds", "array-contains", "kid"))));
    await assertFails(getDocs(collection(as("kid"), "families")));
    await assertFails(getDocs(query(collection(as("stranger"), "families"), where("name", "==", "Sharma"))));
  });
  it("nobody can write from the client — not even the owner", async () => {
    await assertFails(updateDoc(doc(as("owner"), "families/fam1"), { name: "x" }));
    await assertFails(deleteDoc(doc(as("owner"), "families/fam1")));
  });
  it("blocks self-joining and role escalation", async () => {
    await assertFails(updateDoc(doc(as("stranger"), "families/fam1"), { memberIds: ["owner", "guard", "kid", "stranger"] }));
    await assertFails(updateDoc(doc(as("kid"), "families/fam1"), { "members.kid.role": "owner" }));
    await assertFails(setDoc(doc(as("stranger"), "families/evil"), { ownerId: "stranger", memberIds: ["stranger", "kid"] }));
  });
});

describe("familyInvitations/{inviteId}", () => {
  it("the invitee with a VERIFIED matching email can read it", async () => {
    await assertSucceeds(getDoc(doc(as("newbie", { email: "new@example.com", email_verified: true }), "familyInvitations/inv1")));
  });
  it("an UNVERIFIED matching email cannot (no claiming others' invites)", async () => {
    await assertFails(getDoc(doc(as("squatter", { email: "new@example.com", email_verified: false }), "familyInvitations/inv1")));
  });
  it("the invitee with the matching phone can read it", async () => {
    await assertSucceeds(getDoc(doc(as("phoney", { phone_number: "+15550001111" }), "familyInvitations/inv2")));
    await assertFails(getDoc(doc(as("phoney", { phone_number: "+15550009999" }), "familyInvitations/inv2")));
  });
  it("owners and guardians can read; plain members and strangers cannot", async () => {
    await assertSucceeds(getDoc(doc(as("owner"), "familyInvitations/inv1")));
    await assertSucceeds(getDoc(doc(as("guard"), "familyInvitations/inv1")));
    await assertFails(getDoc(doc(as("kid"), "familyInvitations/inv1")));
    await assertFails(getDoc(doc(as("stranger"), "familyInvitations/inv1")));
  });
  it("nobody can accept, forge or revoke invitations from the client", async () => {
    const invitee = as("newbie", { email: "new@example.com", email_verified: true });
    await assertFails(updateDoc(doc(invitee, "familyInvitations/inv1"), { status: "accepted" }));
    await assertFails(updateDoc(doc(invitee, "familyInvitations/inv1"), { role: "guardian" }));
    await assertFails(setDoc(doc(as("stranger"), "familyInvitations/forged"), { familyId: "fam1", inviteeEmail: "me@x.co", status: "pending" }));
    await assertFails(deleteDoc(doc(as("owner"), "familyInvitations/inv1")));
  });
});
