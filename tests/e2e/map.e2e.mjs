/** End-to-end live map: real Google Maps loader (invalid key), consented locations, fallbacks. */
import assert from "node:assert/strict";
import { BASE } from "./env.mjs";
import { chromium, createVerifiedUser, finish, startServer, step, waitForServer } from "./harness.mjs";

const { state, stop } = startServer();
const browser = await chromium.launch();
const pw = "FamilyGuard123";
const t = Date.now();

async function login(email, position) {
  const ctx = await browser.newContext(position ? { permissions: ["geolocation"], geolocation: position } : {});
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

try {
  await waitForServer();
  const u = {};
  for (const n of ["ann", "bob", "cat", "eve"]) {
    u[n] = { email: `${n}.map.${t}@example.com` };
    u[n].uid = await createVerifiedUser(u[n].email, pw, `${n[0].toUpperCase()}${n.slice(1)} Map`);
  }
  const A = await login(u.ann.email, { latitude: 12.9716, longitude: 77.5946, accuracy: 15 });
  const B = await login(u.bob.email, { latitude: 12.9352, longitude: 77.6245, accuracy: 40 });
  const C = await login(u.cat.email, { latitude: 12.95, longitude: 77.6, accuracy: 25 });
  const E = await login(u.eve.email);

  const fam = (await api(A.page, "/api/families", { method: "POST", body: { name: "Map Family" } })).json.family.id;
  for (const [who, P] of [[u.bob, B], [u.cat, C]]) {
    const inv = (await api(A.page, `/api/families/${fam}/invitations`, { method: "POST", body: { email: who.email } })).json.invitation;
    await api(P.page, `/api/invitations/${inv.id}`, { method: "POST", body: { action: "accept" } });
  }
  // Ann and Bob share through the real UI flow; Cat does not share.
  for (const P of [A, B]) {
    await P.page.goto(`${BASE}/settings#location`);
    await P.page.getByRole("button", { name: "Share my location" }).click();
    await P.page.locator('header a[href="/settings#location"]').getByText("Sharing live").waitFor({ timeout: 15_000 });
  }

  console.log("\nMap loading");
  let googleRequested = false;
  B.page.on("request", (r) => r.url().startsWith("https://maps.googleapis.com/") && (googleRequested = true));
  await step("the real Google Maps loader runs and an invalid key is detected → labelled fallback", async () => {
    await B.page.goto(`${BASE}/map`);
    // Google reports the bad key via gm_authFailure; if its key check is blocked
    // by the network, the 15 s watchdog falls back instead. Either is correct.
    await B.page.getByText(/rejected the API key|couldn't be loaded/).waitFor({ timeout: 30_000 });
    assert.ok(googleRequested, "Google Maps JS API was requested");
    await B.page.getByTestId("schematic-map").waitFor();
  });

  console.log("\nMarkers & popups");
  await step("markers appear only for members sharing with this family, colour-coded with online status", async () => {
    await B.page.getByTestId(`pin-${u.ann.uid}`).waitFor();
    await B.page.getByTestId(`pin-${u.bob.uid}`).waitFor();
    assert.equal(await B.page.getByTestId(`pin-${u.cat.uid}`).count(), 0, "non-sharing member has no marker");
    assert.equal(await B.page.getByTestId(`pin-${u.ann.uid}`).getAttribute("data-online"), "true");
    await B.page.getByTestId("sharing-count").getByText("2 of 3 sharing").waitFor();
  });
  await step("clicking a marker shows name, status, last-updated time and accuracy", async () => {
    await B.page.getByRole("button", { name: "Show Ann Map" }).click();
    const popup = B.page.getByTestId("member-popup");
    await popup.getByText("Ann Map").waitFor();
    await popup.getByText("Online").waitFor();
    await popup.getByText("±15 m").waitFor();
    assert.match(await popup.getByRole("link", { name: /Directions/ }).getAttribute("href"), /12\.971600,77\.594600/);
  });
  await step("the schematic is to scale (scale bar) and has zoom controls", async () => {
    await B.page.getByTestId("scale-bar").getByText(/\d+ (m|km)/).waitFor();
    await B.page.getByRole("button", { name: "Zoom in" }).click();
    await B.page.getByRole("button", { name: "Fit everyone on the map" }).click();
  });

  console.log("\nMy location (local only)");
  await step("'My location' for a non-sharing member shows a local dot and sends NOTHING", async () => {
    const posted = [];
    C.page.on("request", (r) => r.url().includes("/api/location") && r.method() === "POST" && posted.push(r.url()));
    await C.page.goto(`${BASE}/map`);
    await C.page.getByTestId("schematic-map").waitFor({ timeout: 30_000 });
    await C.page.getByRole("button", { name: "Show my location" }).click();
    await C.page.getByTestId("pin-me").waitFor();
    await C.page.getByText("is shown only on this screen").waitFor();
    assert.deepEqual(posted, []);
    assert.equal((await api(C.page, "/api/sharing")).json.consent.active, false);
    assert.equal((await api(B.page, `/api/families/${fam}/locations`)).json.members.find((m) => m.uid === u.cat.uid).location, null);
  });

  console.log("\nAccess control");
  await step("an outsider can't load the family on the map, even via ?family=", async () => {
    await E.page.goto(`${BASE}/map?family=${fam}`);
    await E.page.getByText("Join or create a family first").waitFor();
    assert.ok(!(await E.page.content()).includes("Map Family"));
    assert.equal((await api(E.page, `/api/families/${fam}/locations`)).status, 404);
  });
  await step("when someone stops sharing, their marker disappears", async () => {
    await api(A.page, "/api/sharing", { method: "DELETE" });
    await B.page.getByRole("button", { name: "Refresh locations" }).click();
    await B.page.getByTestId(`pin-${u.ann.uid}`).waitFor({ state: "detached" });
    await B.page.getByTestId("sharing-count").getByText("1 of 3 sharing").waitFor();
  });

  console.log("\nDashboard");
  await step("the dashboard shows the compact live map", async () => {
    await B.page.goto(`${BASE}/dashboard`);
    await B.page.getByTestId("schematic-map").waitFor({ timeout: 30_000 }); // invalid key → fallback (auth hook or watchdog)
    await B.page.getByTestId(`pin-${u.bob.uid}`).waitFor({ timeout: 30_000 });
    await B.page.getByRole("link", { name: "Open full map →" }).waitFor();
  });
} finally {
  await browser.close();
  stop();
}
finish(state.log);
