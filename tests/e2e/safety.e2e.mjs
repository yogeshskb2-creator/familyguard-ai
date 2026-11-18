/** End-to-end SOS + safe zones: several real users, real browser geolocation, real emulators. */
import assert from "node:assert/strict";
import { BASE } from "./env.mjs";
import { chromium, createVerifiedUser, finish, startServer, step, waitForServer } from "./harness.mjs";

const { state, stop } = startServer();
const browser = await chromium.launch();
const pw = "FamilyGuard123";
const t = Date.now();
const HOME = { latitude: 12.9716, longitude: 77.5946 };
const FAR = { latitude: 12.99, longitude: 77.62, accuracy: 10 };
const AT_HOME = { latitude: 12.9717, longitude: 77.5947, accuracy: 10 };

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
    u[n] = { email: `${n}.safe.${t}@example.com`, name: `${n[0].toUpperCase()}${n.slice(1)} Safe` };
    u[n].uid = await createVerifiedUser(u[n].email, pw, u[n].name);
  }
  const A = await login(u.ann.email, FAR);
  const B = await login(u.bob.email); // no location permission
  const C = await login(u.cat.email, { ...HOME, accuracy: 15 });
  const E = await login(u.eve.email);

  const fam = (await api(A.page, "/api/families", { method: "POST", body: { name: "Safe Family" } })).json.family.id;
  for (const [who, P, role] of [[u.bob, B, "guardian"], [u.cat, C, "member"]]) {
    const inv = (await api(A.page, `/api/families/${fam}/invitations`, { method: "POST", body: { email: who.email, role } })).json.invitation;
    await api(P.page, `/api/invitations/${inv.id}`, { method: "POST", body: { action: "accept" } });
  }
  await api(E.page, "/api/families", { method: "POST", body: { name: "Eve Family" } });

  console.log("\nSOS — confirmation required");
  await step("opening the SOS dialog and cancelling sends nothing", async () => {
    await C.page.goto(`${BASE}/sos`);
    await C.page.getByRole("button", { name: /Emergency SOS/ }).click();
    const dialog = C.page.getByRole("alertdialog");
    await dialog.getByText("Send emergency SOS?").waitFor();
    await dialog.getByRole("button", { name: "Send SOS to 2" }).waitFor(); // Ann + Bob
    await dialog.getByRole("button", { name: "Cancel" }).click();
    assert.equal((await api(C.page, "/api/sos")).json.alerts.length, 0);
    assert.equal((await api(A.page, "/api/notifications?count=1")).json.unread, 0);
  });

  let alertId;
  console.log("\nSOS — send & receive");
  await step("confirmed SOS is sent with message and one-time location", async () => {
    await C.page.getByRole("button", { name: /Emergency SOS/ }).click();
    const dialog = C.page.getByRole("alertdialog");
    await dialog.getByLabel("Message (optional)").fill("Stuck at the station");
    await dialog.getByRole("button", { name: "Send SOS to 2" }).click();
    await C.page.waitForURL(/\/sos\?alert=/);
    alertId = new URL(C.page.url()).searchParams.get("alert");
    const card = C.page.getByTestId(`alert-${alertId}`);
    await card.getByText("Your SOS").waitFor();
    await card.getByText("“Stuck at the station”").waitFor();
    await card.getByText("12.97160, 77.59460").waitFor();
    await card.getByText("Not acknowledged yet").waitFor();
    assert.equal((await api(C.page, "/api/sharing")).json.consent.active, false, "SOS must not turn on sharing");
  });
  await step("family members get an app-wide SOS banner and an unread notification", async () => {
    await A.page.goto(`${BASE}/dashboard`);
    const banner = A.page.getByTestId("sos-banner");
    await banner.getByText(`SOS from ${u.cat.name}`).waitFor({ timeout: 20_000 });
    await banner.getByText("“Stuck at the station”").waitFor();
    await A.page.getByTestId("unread-badge").waitFor({ timeout: 35_000 });
    await A.page.goto(`${BASE}/notifications`);
    await A.page.getByText(`🚨 SOS from ${u.cat.name}`).waitFor();
  });
  await step("outsiders can't see or acknowledge it", async () => {
    assert.ok(!(await api(E.page, "/api/sos")).json.alerts.some((a) => a.id === alertId));
    assert.equal((await api(E.page, `/api/sos/${alertId}/acknowledge`, { method: "POST" })).status, 404);
    assert.equal((await api(E.page, `/api/sos/${alertId}/resolve`, { method: "POST", body: { outcome: "resolved" } })).status, 404);
  });
  await step("a recipient acknowledges; the sender sees who saw it", async () => {
    await A.page.goto(`${BASE}/dashboard`);
    await A.page.getByTestId("sos-banner").getByRole("button", { name: /I've seen this/ }).click();
    await A.page.getByTestId("sos-banner").getByText(`seen by ${u.ann.name}`).waitFor({ timeout: 15_000 });
    await C.page.reload();
    await C.page.getByTestId(`alert-${alertId}`).getByText(`Seen by ${u.ann.name}`).waitFor();
  });
  await step("only the sender can cancel an SOS (a guardian gets 403)", async () => {
    assert.equal((await api(B.page, `/api/sos/${alertId}/resolve`, { method: "POST", body: { outcome: "cancelled" } })).status, 403);
  });
  await step("sender marks 'I'm safe': banner disappears, history shows Resolved", async () => {
    await C.page.getByTestId(`alert-${alertId}`).getByRole("button", { name: "I'm safe" }).click();
    await C.page.getByTestId(`alert-${alertId}`).getByText("Resolved", { exact: true }).waitFor();
    await A.page.goto(`${BASE}/dashboard`);
    await A.page.getByText(`${u.cat.name} sent an SOS`).waitFor(); // activity feed
    await A.page.waitForTimeout(1500);
    assert.equal(await A.page.getByTestId("sos-banner").count(), 0);
  });
  await step("without location permission the SOS still goes out, clearly without location", async () => {
    await B.page.goto(`${BASE}/sos`);
    await B.page.getByRole("button", { name: /Emergency SOS/ }).click();
    await B.page.getByRole("alertdialog").getByRole("button", { name: /Send SOS to/ }).click();
    await B.page.waitForURL(/\/sos\?alert=/);
    const id = new URL(B.page.url()).searchParams.get("alert");
    await B.page.getByText("Sent without your location").waitFor();
    await B.page.getByTestId(`alert-${id}`).getByText("No location attached").waitFor();
    await B.page.getByTestId(`alert-${id}`).getByRole("button", { name: "Cancel — false alarm" }).click();
    await B.page.getByTestId(`alert-${id}`).getByText("Cancelled", { exact: true }).waitFor();
  });
  await step("emergency contacts: add one, one-tap call links", async () => {
    await C.page.goto(`${BASE}/sos`);
    await C.page.getByRole("button", { name: "Edit" }).click();
    const form = C.page.getByRole("form", { name: "Add emergency contact" });
    await form.getByLabel("Name").fill("Dr Rao");
    await form.getByLabel("Phone").fill("+91 98765 43210");
    await form.getByRole("button", { name: "Add contact" }).click();
    await C.page.getByText("Saved.").waitFor();
    await C.page.getByRole("button", { name: "Done" }).click();
    assert.equal(await C.page.getByRole("link", { name: "Call Dr Rao" }).getAttribute("href"), "tel:+919876543210");
    assert.equal(await C.page.getByRole("link", { name: /Call emergency services/ }).getAttribute("href"), "tel:112");
    assert.equal((await api(A.page, "/api/emergency")).json.contacts.length, 0, "contacts are private per user");
  });

  let zoneId;
  console.log("\nSafe zones");
  await step("owner creates a 'Home' zone; it's drawn on the map", async () => {
    await A.page.goto(`${BASE}/geofences`);
    const form = A.page.getByRole("form", { name: "Create safe zone" });
    await form.getByRole("radio", { name: "Home" }).click();
    await form.getByLabel("Latitude").fill(String(HOME.latitude));
    await form.getByLabel("Longitude").fill(String(HOME.longitude));
    await form.getByRole("button", { name: "Create safe zone" }).click();
    await A.page.getByText("Safe zone “Home” created.").waitFor();
    zoneId = (await api(A.page, `/api/families/${fam}/geofences`)).json.zones[0].id;
    await A.page.getByTestId(`zone-row-${zoneId}`).waitFor();
    await A.page.getByTestId(`zone-${zoneId}`).first().waitFor({ timeout: 30_000 });
  });
  await step("members can view zones but not create or change them (UI and API)", async () => {
    await C.page.goto(`${BASE}/geofences`);
    await C.page.getByTestId(`zone-row-${zoneId}`).waitFor();
    assert.equal(await C.page.getByRole("form", { name: "Create safe zone" }).count(), 0);
    assert.equal(await C.page.getByTestId(`zone-row-${zoneId}`).getByRole("checkbox").first().isDisabled(), true);
    assert.equal((await api(C.page, `/api/families/${fam}/geofences/${zoneId}`, { method: "PATCH", body: { radius: 5000 } })).status, 403);
    assert.equal((await api(E.page, `/api/families/${fam}/geofences`)).status, 404);
  });
  await step("turning off 'On leaving' keeps the other toggles as they were (regression)", async () => {
    await Promise.all([
      A.page.waitForResponse((r) => r.url().includes(`/geofences/${zoneId}`) && r.request().method() === "PATCH" && r.ok()),
      A.page.getByTestId(`zone-row-${zoneId}`).getByRole("checkbox", { name: "On leaving" }).uncheck(),
    ]);
    const z = (await api(A.page, `/api/families/${fam}/geofences`)).json.zones[0];
    assert.deepEqual([z.alertsEnabled, z.notifyOnEnter, z.notifyOnExit], [true, true, false]);
  });
  await step("arriving home (consented sharing) notifies the family and shows in the activity feed", async () => {
    await C.ctx.setGeolocation(FAR);
    await C.page.goto(`${BASE}/settings#location`);
    await C.page.getByRole("button", { name: "Share my location" }).click();
    await C.page.locator('header a[href="/settings#location"]').getByText("Sharing live").waitFor({ timeout: 15_000 });
    await C.page.waitForTimeout(1000);
    const before = (await api(A.page, "/api/notifications")).json.items.length;
    await C.ctx.setGeolocation(AT_HOME);
    await Promise.all([
      C.page.waitForResponse((r) => r.url().endsWith("/api/location") && r.request().method() === "POST" && r.ok(), { timeout: 20_000 }),
      C.page.goto(`${BASE}/dashboard`),
    ]);
    const items = (await api(A.page, "/api/notifications")).json.items;
    assert.equal(items.length, before + 1);
    assert.equal(items[0].title, `${u.cat.name} arrived at Home`);
    await A.page.goto(`${BASE}/dashboard`);
    await A.page.getByText(`${u.cat.name} arrived at Home`).waitFor();
  });
  await step("leaving with 'On leaving' off logs the event but sends no notification", async () => {
    const before = (await api(A.page, "/api/notifications")).json.items.length;
    await C.ctx.setGeolocation(FAR);
    await Promise.all([
      C.page.waitForResponse((r) => r.url().endsWith("/api/location") && r.request().method() === "POST" && r.ok(), { timeout: 20_000 }),
      C.page.reload(),
    ]);
    assert.equal((await api(A.page, "/api/notifications")).json.items.length, before);
    const events = (await api(A.page, `/api/families/${fam}/events`)).json.events;
    assert.equal(events[0].type, "geofence_exit");
  });
  await step("the person who moved is never notified about themselves", async () => {
    const mine = (await api(C.page, "/api/notifications")).json.items;
    assert.ok(!mine.some((n) => n.kind.startsWith("geofence")));
  });
} finally {
  await browser.close();
  stop();
}
finish(state.log);
