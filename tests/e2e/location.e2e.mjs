/** End-to-end consent-based location sharing: real browser geolocation, real emulators. */
import assert from "node:assert/strict";
import { BASE, FS_EMU, PROJECT_ID } from "./env.mjs";
import { chromium, createVerifiedUser, finish, startServer, step, waitForServer } from "./harness.mjs";

const { state, stop } = startServer();
const browser = await chromium.launch();
const pw = "FamilyGuard123";
const t = Date.now();
const HOME_POS = { latitude: 12.9716, longitude: 77.5946, accuracy: 15 };
const PARK_POS = { latitude: 12.9763, longitude: 77.5929, accuracy: 20 };

/** Counts every call the page makes into navigator.geolocation. */
const COUNT_GEO = `(() => {
  window.__geoCalls = 0;
  const g = navigator.geolocation;
  for (const m of ["getCurrentPosition", "watchPosition"]) {
    const orig = g[m].bind(g);
    g[m] = (...a) => { window.__geoCalls++; return orig(...a); };
  }
})();`;

async function login(email, { geo = true, position = HOME_POS } = {}) {
  const ctx = await browser.newContext(geo ? { permissions: ["geolocation"], geolocation: position } : {});
  await ctx.addInitScript(COUNT_GEO);
  const page = await ctx.newPage();
  await page.goto(`${BASE}/login`);
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password").fill(pw);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(/\/dashboard/);
  return { ctx, page };
}
const api = (page, path, init = {}) =>
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
const locationDocExists = async (uid) =>
  (await fetch(`${FS_EMU}/v1/projects/${PROJECT_ID}/databases/(default)/documents/locations/${uid}`, { headers: { Authorization: "Bearer owner" } })).ok;
const indicator = (page) => page.locator('header a[href="/settings#location"]');

try {
  await waitForServer();
  const users = {};
  for (const n of ["ann", "bob", "cat", "dan"]) {
    const email = `${n}.loc.${t}@example.com`;
    users[n] = { email, uid: await createVerifiedUser(email, pw, n[0].toUpperCase() + n.slice(1)) };
  }
  const A = await login(users.ann.email);
  const B = await login(users.bob.email);
  const C = await login(users.cat.email);

  // Ann owns "Home" (with Bob) and "Work" (with Cat).
  const home = (await api(A.page, "/api/families", { method: "POST", body: { name: "Home" } })).json.family.id;
  const work = (await api(A.page, "/api/families", { method: "POST", body: { name: "Work" } })).json.family.id;
  for (const [fam, who, page] of [[home, users.bob, B.page], [work, users.cat, C.page]]) {
    const inv = (await api(A.page, `/api/families/${fam}/invitations`, { method: "POST", body: { email: who.email } })).json.invitation;
    assert.equal((await api(page, `/api/invitations/${inv.id}`, { method: "POST", body: { action: "accept" } })).status, 200);
  }

  console.log("\nNo collection without consent");
  await step("before consent the app never calls the Geolocation API (even with permission pre-granted)", async () => {
    for (const path of ["/dashboard", "/settings", `/family/${home}`]) {
      await A.page.goto(`${BASE}${path}`);
      await A.page.waitForLoadState("networkidle");
      assert.equal(await A.page.evaluate(() => window.__geoCalls), 0, `geolocation touched on ${path}`);
    }
    await indicator(A.page).getByText("Not sharing").waitFor();
  });
  await step("the API refuses locations without consent", async () => {
    const r = await api(A.page, "/api/location", { method: "POST", body: { lat: 1, lng: 1, accuracy: 5, timestamp: Date.now() } });
    assert.equal(r.status, 409);
    assert.equal(await locationDocExists(users.ann.uid), false);
  });

  console.log("\nOpt in");
  await step("user shares with ONE chosen family; indicator goes live", async () => {
    await A.page.goto(`${BASE}/settings#location`);
    await A.page.getByRole("checkbox", { name: "Work" }).uncheck();
    await A.page.getByRole("checkbox", { name: /Keep my location history/ }).check();
    await A.page.getByRole("button", { name: "Share my location" }).click();
    await indicator(A.page).getByText("Sharing live").waitFor({ timeout: 15_000 });
    await A.page.getByTestId("last-sent").getByText("12.97160").waitFor();
    assert.equal(await locationDocExists(users.ann.uid), true);
  });
  await step("a member of the chosen family sees the location, accuracy and online status", async () => {
    await B.page.goto(`${BASE}/family/${home}`);
    const row = B.page.getByTestId(`loc-${users.ann.uid}`);
    await row.getByText("12.9716, 77.5946").waitFor();
    await row.getByText("±15 m").waitFor();
    await row.getByText("Online").waitFor();
  });
  await step("members of the family she did NOT choose can't see it", async () => {
    await C.page.goto(`${BASE}/family/${work}`);
    await C.page.getByTestId(`loc-${users.ann.uid}`).getByText("Not sharing with this family").waitFor();
    const r = await api(C.page, `/api/families/${work}/locations`);
    assert.equal(r.json.members.find((m) => m.uid === users.ann.uid).location, null);
    assert.equal((await api(C.page, `/api/families/${home}/locations`)).status, 404);
  });

  console.log("\nUpdates");
  await step("reopening the app resumes sharing automatically (permission already granted) and sends the new position", async () => {
    await A.ctx.setGeolocation(PARK_POS);
    // "Sharing live" means watching has started; wait until the new fix actually reached the server.
    await Promise.all([
      A.page.waitForResponse((r) => r.url().endsWith("/api/location") && r.request().method() === "POST" && r.ok(), { timeout: 20_000 }),
      A.page.goto(`${BASE}/dashboard`),
    ]);
    await indicator(A.page).getByText("Sharing live").waitFor({ timeout: 15_000 });
    await B.page.getByRole("button", { name: "Refresh locations" }).click();
    await B.page.getByTestId(`loc-${users.ann.uid}`).getByText("12.9763, 77.5929").waitFor({ timeout: 15_000 });
  });
  await step("opt-in history recorded both places and is visible only to its owner", async () => {
    const mine = await api(A.page, "/api/location/history");
    assert.equal(mine.json.points.length, 2);
    await A.page.goto(`${BASE}/settings`);
    await A.page.locator("#main").getByText("2 points stored.").locator("visible=true").waitFor();
    // There is no API for reading anyone else's history at all.
    assert.equal((await api(B.page, `/api/location/history`)).json.points.length, 0);
  });
  await step("narrowing who can see you takes effect immediately", async () => {
    await A.page.getByRole("checkbox", { name: "Work" }).check();
    await Promise.all([
      A.page.waitForResponse((r) => r.url().endsWith("/api/sharing") && r.request().method() === "PATCH" && r.ok()),
      A.page.getByRole("button", { name: "Save sharing settings" }).click(),
    ]);
    await A.page.getByText("Sharing settings updated.").waitFor();
    assert.ok((await api(C.page, `/api/families/${work}/locations`)).json.members.find((m) => m.uid === users.ann.uid).location);
    await A.page.getByRole("checkbox", { name: "Work" }).uncheck();
    await Promise.all([
      A.page.waitForResponse((r) => r.url().endsWith("/api/sharing") && r.request().method() === "PATCH" && r.ok()),
      A.page.getByRole("button", { name: "Save sharing settings" }).click(),
    ]);
    await A.page.getByText("Sharing settings updated.").waitFor();
    assert.equal((await api(C.page, `/api/families/${work}/locations`)).json.members.find((m) => m.uid === users.ann.uid).location, null);
  });

  console.log("\nRevocation");
  await step("stopping on another device stops this tab too (server refuses further updates)", async () => {
    await A.page.goto(`${BASE}/settings`);
    await indicator(A.page).getByText("Sharing live").waitFor({ timeout: 15_000 });
    const A2 = await login(users.ann.email);
    await A2.page.goto(`${BASE}/settings`);
    await A2.page.getByRole("button", { name: "Stop sharing" }).click();
    await A2.page.getByRole("alertdialog").getByRole("button", { name: "Stop sharing" }).click();
    await A2.page.getByText("Your live location was deleted").waitFor();
    assert.equal(await locationDocExists(users.ann.uid), false);
    // First tab's next update (after the 15 s throttle) is refused → it switches itself off.
    await A.ctx.setGeolocation({ latitude: 12.99, longitude: 77.61, accuracy: 10 });
    // Trailing throttle: the move is sent ≤15 s after the previous update, and refused.
    await indicator(A.page).getByText("Not sharing").waitFor({ timeout: 30_000 });
    await A.page.getByText("turned off (possibly from another device)").waitFor();
    assert.equal(await locationDocExists(users.ann.uid), false, "stale tab must not recreate the location");
    await A2.ctx.close();
  });
  await step("family members see 'Not sharing' after revocation", async () => {
    await B.page.getByRole("button", { name: "Refresh locations" }).click();
    await B.page.getByTestId(`loc-${users.ann.uid}`).getByText("Not sharing with this family").waitFor();
  });
  await step("history can be deleted completely", async () => {
    await A.page.goto(`${BASE}/settings`);
    await A.page.getByRole("button", { name: "Delete all history" }).click();
    await A.page.getByRole("alertdialog").getByRole("button", { name: "Delete history" }).click();
    await A.page.getByText(/Deleted \d+ points?\./).locator("visible=true").waitFor();
    assert.equal((await api(A.page, "/api/location/history")).json.points.length, 0);
  });

  console.log("\nBrowser permission denied");
  await step("if the browser denies permission, no consent is stored and the UI explains why", async () => {
    const dan = await login(users.dan.email, { geo: false });
    const inv = (await api(A.page, `/api/families/${home}/invitations`, { method: "POST", body: { email: users.dan.email } })).json.invitation;
    await api(dan.page, `/api/invitations/${inv.id}`, { method: "POST", body: { action: "accept" } });
    await dan.page.goto(`${BASE}/settings`);
    await dan.page.getByRole("button", { name: "Share my location" }).click();
    await dan.page.getByText("Location permission was denied").waitFor({ timeout: 15_000 });
    await indicator(dan.page).getByText("Not sharing").waitFor();
    assert.equal((await api(dan.page, "/api/sharing")).json.consent.active, false);
    await dan.ctx.close();
  });

  console.log("\nForgery");
  await step("a user can't post a location for someone else or to families they chose not to share with", async () => {
    // Fresh user, so the per-user location rate limit (8/min) doesn't mask validation.
    const D = await login(users.dan.email);
    await api(D.page, "/api/sharing", { method: "POST", body: { familyIds: [home], keepHistory: false, historyRetentionDays: 7 } });
    const base = { lat: 1, lng: 1, accuracy: 5, timestamp: Date.now() };
    assert.equal((await api(D.page, "/api/location", { method: "POST", body: { ...base, uid: users.bob.uid } })).status, 400);
    assert.equal((await api(D.page, "/api/location", { method: "POST", body: { ...base, sharedWith: [work] } })).status, 400);
    assert.equal((await api(C.page, "/api/sharing", { method: "POST", body: { familyIds: [home], keepHistory: false, historyRetentionDays: 7 } })).status, 403);
    await api(D.page, "/api/sharing", { method: "DELETE" });
    await D.ctx.close();
  });
  await step("location updates are rate-limited per user", async () => {
    const E = await login(users.bob.email);
    await api(E.page, "/api/sharing", { method: "POST", body: { familyIds: [home], keepHistory: false, historyRetentionDays: 7 } });
    const statuses = [];
    for (let i = 0; i < 10; i++) {
      statuses.push((await api(E.page, "/api/location", { method: "POST", body: { lat: 12 + i / 100, lng: 77, accuracy: 5, timestamp: Date.now() } })).status);
    }
    assert.ok(statuses.includes(429), `expected a 429 in ${statuses}`);
    await api(E.page, "/api/sharing", { method: "DELETE" });
    await E.ctx.close();
  });
} finally {
  await browser.close();
  stop();
}
finish(state.log);
