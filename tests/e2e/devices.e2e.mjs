/** End-to-end devices + push routing (FCM is recorded via the emulator push log). */
import assert from "node:assert/strict";
import { BASE, FS_EMU, PROJECT_ID } from "./env.mjs";
import { chromium, createVerifiedUser, finish, startServer, step, waitForServer } from "./harness.mjs";

const { state, stop } = startServer();
const browser = await chromium.launch();
const pw = "FamilyGuard123";
const t = Date.now();
const FAKE_TOKEN = `e2e-fcm-token-${"x".repeat(40)}`;

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
/** Pushes the server would have sent to FCM (emulator-only log), for one user. */
async function pushesFor(uid) {
  const r = await fetch(`${FS_EMU}/v1/projects/${PROJECT_ID}/databases/(default)/documents/_pushLog?pageSize=300`, {
    headers: { Authorization: "Bearer owner" },
  });
  const docs = (await r.json()).documents ?? [];
  return docs
    .map((d) => d.fields)
    .filter((f) => f.uid.stringValue === uid)
    .map((f) => ({ title: f.title.stringValue, kind: f.kind.stringValue, critical: f.critical.booleanValue, devices: Number(f.deviceCount.integerValue) }));
}

try {
  await waitForServer();
  const u = {};
  for (const n of ["ann", "bob", "eve"]) {
    u[n] = { email: `${n}.dev.${t}@example.com`, name: `${n[0].toUpperCase()}${n.slice(1)} Dev` };
    u[n].uid = await createVerifiedUser(u[n].email, pw, u[n].name);
  }
  const A = await login(u.ann.email, { latitude: 12.97, longitude: 77.59, accuracy: 10 });
  const B = await login(u.bob.email);
  const E = await login(u.eve.email);
  const fam = (await api(A.page, "/api/families", { method: "POST", body: { name: "Dev Family" } })).json.family.id;
  const inv = (await api(A.page, `/api/families/${fam}/invitations`, { method: "POST", body: { email: u.bob.email } })).json.invitation;
  await api(B.page, `/api/invitations/${inv.id}`, { method: "POST", body: { action: "accept" } });

  let deviceId;
  console.log("\nDevice registry");
  await step("registering this device lists it as 'this device', online, push off", async () => {
    await A.page.goto(`${BASE}/devices`);
    await A.page.getByText("Account status").waitFor();
    const form = A.page.getByRole("form", { name: "Register this device" });
    await form.getByLabel("Device name").fill("Ann's laptop");
    await form.getByRole("button", { name: "Register this device" }).click();
    await A.page.getByText("This device is registered.").waitFor();
    deviceId = await A.page.evaluate(() => localStorage.getItem("fg.deviceId"));
    const row = A.page.getByTestId(`device-${deviceId}`);
    await row.getByText("(this device)").waitFor();
    await row.getByText("Online").waitFor();
    await row.getByText("Push off").waitFor();
  });
  await step("a security notification is created for the new device", async () => {
    const items = (await api(A.page, "/api/notifications")).json.items;
    assert.equal(items[0].title, "New device added: Ann's laptop");
  });
  await step("push opt-in explains honestly when the server has no web-push key", async () => {
    await A.page.getByText("Push notifications unavailable here").waitFor();
    await A.page.getByText(/web-push key is missing/).waitFor();
  });
  await step("the push token is never returned to the browser", async () => {
    // (Stand-in for Firebase's getToken(), which needs a real project.)
    const r = await api(A.page, `/api/devices/${deviceId}/push`, { method: "PUT", body: { token: FAKE_TOKEN } });
    assert.equal(r.status, 200);
    assert.ok(!JSON.stringify(r.json).includes(FAKE_TOKEN));
    assert.ok(!JSON.stringify((await api(A.page, "/api/devices")).json).includes(FAKE_TOKEN));
    await A.page.reload();
    await A.page.getByTestId(`device-${deviceId}`).getByText("Push on").waitFor();
  });

  console.log("\nPush routing");
  await step("an SOS is pushed (critical) to the recipient's push-enabled device", async () => {
    await api(B.page, "/api/sos", { method: "POST", body: { message: "Test alert" } });
    const p = await pushesFor(u.ann.uid);
    const sos = p.find((x) => x.kind === "sos");
    assert.ok(sos, JSON.stringify(p));
    assert.deepEqual([sos.critical, sos.devices], [true, 1]);
    assert.equal(sos.title, `🚨 SOS from ${u.bob.name}`);
    assert.equal((await pushesFor(u.bob.uid)).filter((x) => x.kind === "sos").length, 0, "sender gets no SOS push");
  });
  await step("turning off a category in preferences stops those pushes", async () => {
    await A.page.goto(`${BASE}/notifications`);
    const box = A.page.getByRole("checkbox", { name: /Location sharing changes/ });
    await Promise.all([A.page.waitForResponse((r) => r.url().endsWith("/api/notifications/preferences") && r.ok()), box.uncheck()]);
    assert.equal((await api(A.page, "/api/notifications/preferences")).json.prefs.sharing, false);
    await api(B.page, "/api/sharing", { method: "POST", body: { familyIds: [fam], keepHistory: false, historyRetentionDays: 7 } });
    assert.equal((await pushesFor(u.ann.uid)).filter((x) => x.kind === "sharing_started").length, 0);
    const inbox = (await api(A.page, "/api/notifications")).json.items;
    assert.equal(inbox[0].kind, "sharing_started", "the in-app inbox still records it");
  });

  console.log("\nLocation status per device");
  await step("the device sending your location is marked 'Sending location'", async () => {
    await A.page.goto(`${BASE}/settings#location`);
    await A.page.getByRole("button", { name: "Share my location" }).click();
    await Promise.all([
      A.page.waitForResponse((r) => r.url().endsWith("/api/location") && r.request().method() === "POST" && r.ok(), { timeout: 20_000 }),
      A.page.locator('header a[href="/settings#location"]').getByText("Sharing live").waitFor({ timeout: 15_000 }),
    ]);
    await A.page.goto(`${BASE}/devices`);
    await A.page.getByTestId(`device-${deviceId}`).getByText("Sending location").waitFor();
  });

  console.log("\nIsolation & revocation");
  await step("other users can't see or touch your devices (404)", async () => {
    assert.deepEqual((await api(E.page, "/api/devices")).json.devices, []);
    for (const [path, method] of [
      [`/api/devices/${deviceId}/revoke`, "POST"],
      [`/api/devices/${deviceId}`, "DELETE"],
      [`/api/devices/${deviceId}/heartbeat`, "POST"],
    ]) {
      assert.equal((await api(E.page, path, { method })).status, 404, path);
    }
    assert.equal((await api(E.page, `/api/devices/${deviceId}/push`, { method: "PUT", body: { token: `steal-${"y".repeat(30)}` } })).status, 404);
  });
  await step("removing the device stops its pushes and forgets it locally", async () => {
    const row = A.page.getByTestId(`device-${deviceId}`);
    await row.getByRole("button", { name: /Remove/ }).click();
    await A.page.getByRole("alertdialog").getByRole("button", { name: "Remove device" }).click();
    await row.getByText("Removed", { exact: true }).waitFor();
    assert.equal(await A.page.evaluate(() => localStorage.getItem("fg.deviceId")), null);
    const before = (await pushesFor(u.ann.uid)).length;
    await api(B.page, "/api/sos", { method: "POST", body: { message: "Second" } }); // dedups into the active alert
    await api(B.page, `/api/families/${fam}/geofences`, { method: "POST", body: { name: "X", kind: "custom", lat: 1, lng: 1, radius: 100 } });
    const sosId = (await api(B.page, "/api/sos")).json.active[0].id;
    await api(B.page, `/api/sos/${sosId}/resolve`, { method: "POST", body: { outcome: "cancelled" } });
    assert.equal((await pushesFor(u.ann.uid)).length, before, "no pushes to a removed device");
    assert.equal((await api(A.page, `/api/devices/${deviceId}/heartbeat`, { method: "POST" })).status, 410);
  });

  console.log("\nInvitations");
  await step("an invited existing user gets an in-app invitation notification", async () => {
    await api(A.page, `/api/families/${fam}/invitations`, { method: "POST", body: { email: u.eve.email } });
    await E.page.goto(`${BASE}/notifications`);
    await E.page.getByText(`${u.ann.name} invited you to Dev Family`).waitFor();
    await E.page.goto(`${BASE}/dashboard`);
    await E.page.getByTestId("unread-badge").waitFor({ timeout: 35_000 });
  });

  await step("the push service worker is served from the site root as JavaScript", async () => {
    const r = await fetch(`${BASE}/firebase-messaging-sw.js`);
    assert.equal(r.status, 200);
    assert.match(r.headers.get("content-type"), /javascript/);
    assert.match(await r.text(), /addEventListener\("push"/);
  });
} finally {
  await browser.close();
  stop();
}
finish(state.log);
