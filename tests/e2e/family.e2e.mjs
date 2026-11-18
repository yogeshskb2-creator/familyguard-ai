/** End-to-end family management: several real users, real emulators, real browser. */
import assert from "node:assert/strict";
import { BASE } from "./env.mjs";
import { chromium, createVerifiedUser, finish, signedInPage, startServer, step, waitForServer } from "./harness.mjs";

const { state, stop } = startServer();
const browser = await chromium.launch();
const pw = "FamilyGuard123";
const t = Date.now();
const people = {
  ananya: { email: `ananya.${t}@example.com`, name: "Ananya Sharma" },
  rohan: { email: `rohan.${t}@example.com`, name: "Rohan Sharma" },
  meera: { email: `meera.${t}@example.com`, name: "Meera Sharma" },
  eve: { email: `eve.${t}@example.com`, name: "Eve Outsider" },
};

/** Non-members get the not-found page and none of the family's data. (With streaming the status may be 200.) */
async function assertNoAccess(page, url, secret) {
  await page.goto(url);
  await page.getByText("Page not found").waitFor();
  const html = await page.content();
  assert.ok(!html.includes(secret), `page must not contain "${secret}"`);
}

const apiFrom = (page, path, init = {}) =>
  page.evaluate(
    async ({ path, init }) => {
      const r = await fetch(path, {
        method: init.method ?? "GET",
        headers: init.body ? { "Content-Type": "application/json" } : undefined,
        body: init.body ? JSON.stringify(init.body) : undefined,
      });
      return { status: r.status, json: await r.json().catch(() => null) };
    },
    { path, init },
  );

try {
  await waitForServer();
  for (const p of Object.values(people)) p.uid = await createVerifiedUser(p.email, pw, p.name);

  const A = await signedInPage(browser, people.ananya.email, pw);
  const B = await signedInPage(browser, people.rohan.email, pw);
  const C = await signedInPage(browser, people.meera.email, pw);
  const E = await signedInPage(browser, people.eve.email, pw);
  let familyUrl, familyId;

  console.log("\nCreate a family");
  await step("new user sees the empty state and creates a family", async () => {
    await A.page.goto(`${BASE}/family`);
    await A.page.getByText("Create your first family").waitFor();
    await A.page.getByLabel("Family name").fill("Sharma Family");
    await A.page.getByRole("button", { name: "Create family" }).click();
    await A.page.waitForURL(/\/family\/[A-Za-z0-9]{20}$/);
    familyUrl = A.page.url();
    familyId = familyUrl.split("/").pop();
    await A.page.getByRole("heading", { name: "Sharma Family" }).waitFor();
    await A.page.getByText("You are owner").waitFor();
  });

  console.log("\nInvite");
  await step("owner invites a guardian and a member by email", async () => {
    for (const [who, role] of [
      [people.rohan, "guardian"],
      [people.meera, "member"],
    ]) {
      await A.page.getByLabel("Their email address").fill(who.email);
      await A.page.getByLabel("Role").selectOption(role);
      await A.page.getByRole("button", { name: "Send invitation" }).click();
      await A.page.getByText("Invitation created.").waitFor();
      await A.page.getByRole("list", { name: "Pending invitations" }).getByText(who.email).waitFor();
    }
  });
  await step("invalid and duplicate invitations are rejected with clear messages", async () => {
    await A.page.getByLabel("Their email address").fill("not-an-email");
    await A.page.getByRole("button", { name: "Send invitation" }).click();
    await A.page.getByText("Enter a valid email address").waitFor();
    await A.page.getByLabel("Their email address").fill(people.meera.email);
    await A.page.getByRole("button", { name: "Send invitation" }).click();
    await A.page.getByText("already a pending invitation").waitFor();
  });

  let invites;
  await step("outsiders can't see, accept or forge invitations", async () => {
    invites = (await apiFrom(A.page, `/api/families/${familyId}/invitations`)).json.invitations;
    assert.equal(invites.length, 2);
    const meeraInvite = invites.find((i) => i.inviteeEmail === people.meera.email);
    const r1 = await apiFrom(E.page, `/api/invitations/${meeraInvite.id}`, { method: "POST", body: { action: "accept" } });
    assert.equal(r1.status, 404);
    const r2 = await apiFrom(E.page, `/api/families/${familyId}/invitations`);
    assert.equal(r2.status, 404);
    const r3 = await apiFrom(E.page, `/api/families/${familyId}/invitations`, { method: "POST", body: { email: "x@example.com" } });
    assert.equal(r3.status, 404);
  });

  console.log("\nAccept / decline");
  await step("invitee sees the invitation on the dashboard and accepts it", async () => {
    await B.page.goto(`${BASE}/dashboard`);
    await B.page.getByText("1 family invitation waiting").click();
    await B.page.waitForURL(/\/family$/);
    await B.page.getByText("Sharma Family").first().waitFor();
    await B.page.getByText("Invited by Ananya Sharma").waitFor();
    await B.page.getByRole("button", { name: "Accept" }).click();
    // Client-side (router.push) navigation: wait for the URL, then for the content.
    await B.page.waitForURL(familyUrl, { waitUntil: "commit" });
    await B.page.getByText("You are guardian").waitFor();
    const members = B.page.getByRole("list", { name: "Family members" });
    await members.getByText("Ananya Sharma").waitFor();
    await members.getByText("Rohan Sharma").waitFor();
  });
  await step("guardian can only invite members (UI and API)", async () => {
    const options = await B.page.getByLabel("Role").locator("option").allTextContents();
    assert.deepEqual(options.map((o) => o.split(" ")[0]), ["Member"]);
    const r = await apiFrom(B.page, `/api/families/${familyId}/invitations`, { method: "POST", body: { email: "g2@example.com", role: "guardian" } });
    assert.equal(r.status, 403);
  });
  await step("declining keeps the person out", async () => {
    await C.page.goto(`${BASE}/family`);
    await C.page.getByRole("button", { name: "Decline" }).click();
    await C.page.getByText("Create your first family").waitFor();
    assert.equal((await apiFrom(C.page, `/api/families/${familyId}`)).status, 404);
    await assertNoAccess(C.page, familyUrl, "Sharma Family");
  });

  console.log("\nPrivacy");
  await step("members see names and roles but not each other's email", async () => {
    const r = await apiFrom(B.page, `/api/families/${familyId}`);
    assert.equal(r.status, 200);
    const text = JSON.stringify(r.json);
    assert.ok(!text.includes(people.ananya.email), "owner email not exposed");
    assert.ok(text.includes("Ananya Sharma"));
  });
  await step("member profile page works for members and 404s for outsiders", async () => {
    await B.page.goto(`${familyUrl}/members/${people.ananya.uid}`);
    await B.page.getByRole("heading", { name: "Ananya Sharma" }).waitFor();
    await B.page.getByText("Contact details stay private").waitFor();
    await assertNoAccess(E.page, `${familyUrl}/members/${people.ananya.uid}`, "Ananya Sharma");
  });

  console.log("\nRoles & removal");
  await step("owner demotes the guardian; their invite controls disappear", async () => {
    await A.page.goto(familyUrl);
    await A.page.getByRole("button", { name: "Make member" }).click();
    await A.page.getByRole("button", { name: "Make guardian" }).waitFor();
    await B.page.goto(familyUrl);
    await B.page.getByText("You are member").waitFor();
    assert.equal(await B.page.getByRole("button", { name: "Send invitation" }).count(), 0);
    assert.equal((await apiFrom(B.page, `/api/families/${familyId}/invitations`)).status, 403);
  });
  await step("a member cannot remove the owner or promote themselves", async () => {
    assert.equal((await apiFrom(B.page, `/api/families/${familyId}/members/${people.ananya.uid}`, { method: "DELETE" })).status, 403);
    assert.equal(
      (await apiFrom(B.page, `/api/families/${familyId}/members/${people.rohan.uid}`, { method: "PATCH", body: { role: "guardian" } })).status,
      403,
    );
  });
  await step("owner removes a member after confirming; access ends immediately", async () => {
    await A.page.goto(familyUrl);
    await A.page.getByRole("button", { name: "Remove Rohan Sharma" }).click();
    await A.page.getByRole("alertdialog").getByRole("button", { name: "Remove member" }).click();
    await A.page.getByRole("alertdialog").waitFor({ state: "detached" });
    assert.equal(await A.page.getByRole("list", { name: "Family members" }).getByText("Rohan Sharma").count(), 0);
    assert.equal((await apiFrom(B.page, `/api/families/${familyId}`)).status, 404);
    await assertNoAccess(B.page, familyUrl, "Sharma Family");
  });

  console.log("\nDelete");
  await step("deleting requires typing the family name", async () => {
    await A.page.goto(familyUrl);
    await A.page.getByRole("button", { name: "Delete family" }).click();
    const dialog = A.page.getByRole("alertdialog");
    const confirm = dialog.getByRole("button", { name: "Delete family" });
    assert.equal(await confirm.isDisabled(), true);
    await dialog.getByLabel(/Type "Sharma Family"/).fill("Sharma Family");
    await confirm.click();
    await A.page.waitForURL(/\/family$/);
    await A.page.getByText("Create your first family").waitFor();
    assert.equal((await apiFrom(A.page, `/api/families/${familyId}`)).status, 404);
  });

  await step("cross-site family mutations are rejected (CSRF)", async () => {
    const cookie = (await A.ctx.cookies()).find((c) => c.name === "__session").value;
    const r = await fetch(`${BASE}/api/families`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: "https://evil.example", Cookie: `__session=${cookie}` },
      body: JSON.stringify({ name: "Evil" }),
    });
    assert.equal(r.status, 403);
  });
} finally {
  await browser.close();
  stop();
}
finish(state.log);
