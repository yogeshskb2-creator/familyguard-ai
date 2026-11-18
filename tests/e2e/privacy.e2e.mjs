/** End-to-end: CSP, admin console access, location-data and account deletion. */
import assert from "node:assert/strict";
import { AUTH_EMU, BASE, PROJECT_ID } from "./env.mjs";
import { chromium, createVerifiedUser, finish, startServer, step, waitForServer } from "./harness.mjs";

const { state, stop } = startServer();
const browser = await chromium.launch();
const pw = "FamilyGuard123";
const t = Date.now();
const IDT = `${AUTH_EMU}/identitytoolkit.googleapis.com/v1`;
const H = { "Content-Type": "application/json", Authorization: "Bearer owner" };
const cspViolations = [];

async function login(email, opts = {}) {
  const ctx = await browser.newContext(opts.position ? { permissions: ["geolocation"], geolocation: opts.position } : {});
  const page = await ctx.newPage();
  page.on("console", (m) => /Content Security Policy|Refused to (load|connect|execute|frame)/i.test(m.text()) && cspViolations.push(m.text()));
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
/** waitForURL that says where the page actually is (and any error shown) when it times out. */
async function expectUrl(page, test, label) {
  try {
    await page.waitForURL(test, { timeout: 30_000 });
  } catch {
    const alert = await page.getByRole("alert").allInnerTexts().catch(() => []);
    throw new Error(`${label}: still at ${page.url()} — alerts: ${JSON.stringify(alert)}`);
  }
}
const authUser = (uid) =>
  fetch(`${IDT}/projects/${PROJECT_ID}/accounts:lookup`, { method: "POST", headers: H, body: JSON.stringify({ localId: [uid] }) }).then((r) => r.json());

try {
  await waitForServer();
  const u = {};
  for (const n of ["ann", "bob", "root"]) {
    u[n] = { email: `${n}.priv.${t}@example.com`, name: `${n[0].toUpperCase()}${n.slice(1)} Priv` };
    u[n].uid = await createVerifiedUser(u[n].email, pw, u[n].name);
  }
  // Admin rights: a server-set custom claim (what scripts/set-admin.mjs does).
  await fetch(`${IDT}/projects/${PROJECT_ID}/accounts:update`, {
    method: "POST",
    headers: H,
    body: JSON.stringify({ localId: u.root.uid, customAttributes: JSON.stringify({ admin: true }) }),
  });

  console.log("\nHeaders");
  await step("every page is served with a Content-Security-Policy", async () => {
    const r = await fetch(`${BASE}/login`);
    const csp = r.headers.get("content-security-policy") ?? "";
    for (const d of ["frame-ancestors 'none'", "object-src 'none'", "base-uri 'self'", "form-action 'self'"]) assert.ok(csp.includes(d), d);
    assert.equal(r.headers.get("x-frame-options"), "DENY");
  });

  const A = await login(u.ann.email, { position: { latitude: 12.97, longitude: 77.59, accuracy: 10 } });
  const B = await login(u.bob.email);
  const R = await login(u.root.email);
  const fam = (await api(A.page, "/api/families", { method: "POST", body: { name: "Priv Family" } })).json.family.id;
  const inv = (await api(A.page, `/api/families/${fam}/invitations`, { method: "POST", body: { email: u.bob.email, role: "guardian" } })).json.invitation;
  await api(B.page, `/api/invitations/${inv.id}`, { method: "POST", body: { action: "accept" } });

  console.log("\nAdmin console");
  await step("an ordinary user is refused (page and API) and can't self-promote", async () => {
    await A.page.goto(`${BASE}/admin`);
    await A.page.getByText("Administrator access required").waitFor();
    assert.equal((await api(A.page, "/api/admin/stats")).status, 403);
    const r = await api(A.page, "/api/profile", { method: "PATCH", body: { displayName: "Ann Priv", admin: true, isAdmin: true, role: "admin" } });
    assert.equal(r.status, 400, "unknown profile fields are rejected outright");
    assert.equal((await api(A.page, "/api/admin/stats")).status, 403, "still not admin after editing the profile");
  });
  await step("an admin (custom claim) sees aggregate statistics and health", async () => {
    await R.page.goto(`${BASE}/admin`);
    await R.page.getByRole("heading", { name: "System overview" }).waitFor();
    await R.page.getByText("Registered users").waitFor();
    await R.page.getByTestId("health-Firestore").getByText("OK").waitFor();
    const s = (await api(R.page, "/api/admin/stats")).json;
    assert.ok(s.users.total >= 3);
    assert.ok(s.families.total >= 1);
  });
  await step("the admin view contains no personal data", async () => {
    const html = await R.page.content();
    for (const x of [u.ann.email, u.ann.name, u.bob.email, "Priv Family", u.ann.uid]) assert.ok(!html.includes(x), x);
    const json = JSON.stringify((await api(R.page, "/api/admin/stats")).json);
    for (const x of [u.ann.email, u.ann.uid, "Priv Family"]) assert.ok(!json.includes(x), x);
  });
  await step("the refused attempts appear in the pseudonymous security log", async () => {
    const s = (await api(R.page, "/api/admin/stats")).json;
    assert.ok(s.security.byType.some((x) => x.type === "admin_denied" || x.label === "Admin access denied"), JSON.stringify(s.security.byType));
    assert.ok(!JSON.stringify(s.security.recent).includes(u.ann.uid));
  });

  console.log("\nDelete location data");
  await step("start sharing, then delete all location data from Settings", async () => {
    await A.page.goto(`${BASE}/settings#location`);
    await A.page.getByRole("button", { name: "Share my location" }).click();
    await A.page.waitForResponse((r) => r.url().endsWith("/api/location") && r.request().method() === "POST" && r.ok(), { timeout: 20_000 });
    const annLoc = async () => (await api(B.page, `/api/families/${fam}/locations`)).json.members.find((m) => m.uid === u.ann.uid);
    assert.ok((await annLoc()).location, "family sees her while sharing");
    await A.page.getByRole("button", { name: "Delete location data" }).click();
    await A.page.getByRole("alertdialog").getByRole("button", { name: "Delete location data" }).click();
    await A.page.getByText(/Location sharing is off, your live location was deleted/).waitFor();
    assert.equal((await annLoc()).location, null, "family no longer sees her");
    assert.equal((await api(A.page, "/api/sharing")).json.consent.active, false);
  });

  console.log("\nAccount deletion");
  await step("a stale sign-in is sent to sign in again before deleting", async () => {
    // Simulate a session older than 5 minutes (the real check is unit-tested).
    await A.page.route("**/api/account", (route) =>
      route.fulfill({ status: 401, contentType: "application/json", body: JSON.stringify({ error: { code: "reauth_required", message: "Sign in again." } }) }),
    );
    await A.page.goto(`${BASE}/settings#data`);
    await A.page.getByRole("button", { name: "Delete my account" }).click();
    const dlg = A.page.getByRole("alertdialog");
    assert.equal(await dlg.getByRole("button", { name: "Delete account forever" }).isDisabled(), true, "disabled until DELETE is typed");
    await dlg.getByLabel('Type "DELETE" to confirm').fill("DELETE");
    await dlg.getByRole("button", { name: "Delete account forever" }).click();
    await A.page.waitForURL(/\/login\?.*reauth=1/);
    await A.page.getByText("For your security, sign in again").waitFor();
    await A.page.unroute("**/api/account");
  });
  await step("after signing in again, the account is deleted and the family passes to the guardian", async () => {
    await A.page.getByLabel("Email", { exact: true }).fill(u.ann.email);
    await A.page.getByLabel("Password").fill(pw);
    await A.page.getByRole("button", { name: "Sign in" }).click();
    await expectUrl(A.page, /\/settings/, "back to settings after re-auth");
    await A.page.getByRole("button", { name: "Delete my account" }).click();
    const dlg = A.page.getByRole("alertdialog");
    await dlg.getByLabel('Type "DELETE" to confirm').fill("DELETE");
    const t0 = Date.now();
    const [resp] = await Promise.all([
      A.page.waitForResponse((r) => r.url().endsWith("/api/account") && r.request().method() === "DELETE", { timeout: 60_000 }),
      dlg.getByRole("button", { name: "Delete account forever" }).click(),
    ]);
    console.log(`      (account deletion request took ${Date.now() - t0} ms → HTTP ${resp.status()})`);
    assert.equal(resp.status(), 200);
    await expectUrl(A.page, (url) => url.pathname === "/" && url.search.includes("deleted=1"), "deleted confirmation page");
    await A.page.getByText("Your FamilyGuard account and data have been deleted.").waitFor();
    assert.equal((await authUser(u.ann.uid)).users, undefined, "sign-in account removed");
    const f = (await api(B.page, `/api/families/${fam}`)).json.family;
    assert.equal(f.ownerId, u.bob.uid);
    assert.deepEqual(f.members.map((m) => m.uid), [u.bob.uid]);
  });
  await step("the deleted user's old session no longer works", async () => {
    assert.equal((await authUser(u.ann.uid)).users, undefined, "precondition: account really deleted");
    assert.equal((await api(A.page, "/api/families")).status, 401);
    await A.page.goto(`${BASE}/dashboard`);
    await A.page.waitForURL(/\/login/);
  });
  await step("she can't sign in again", async () => {
    await A.page.getByLabel("Email", { exact: true }).fill(u.ann.email);
    await A.page.getByLabel("Password").fill(pw);
    await A.page.getByRole("button", { name: "Sign in" }).click();
    await A.page.getByRole("alert").first().waitFor();
    assert.ok(!A.page.url().includes("/dashboard"));
  });

  console.log("\nContent-Security-Policy in practice");
  await step("no CSP violations on the pages visited", async () => {
    for (const p of ["/dashboard", "/map", "/family", "/sos", "/assistant", "/settings"]) {
      await B.page.goto(`${BASE}${p}`);
      await B.page.waitForLoadState("networkidle").catch(() => undefined);
    }
    assert.deepEqual(cspViolations, []);
  });
  await step("control: the browser really enforces it (an injected foreign script is blocked)", async () => {
    const blocked = await B.page.evaluate(
      () =>
        new Promise((resolve) => {
          document.addEventListener("securitypolicyviolation", (e) => resolve(e.blockedURI), { once: true });
          const s = document.createElement("script");
          s.src = "https://evil.example/steal.js";
          document.head.appendChild(s);
          setTimeout(() => resolve(null), 3000);
        }),
    );
    assert.match(String(blocked), /evil\.example/);
  });
} finally {
  await browser.close();
  stop();
}
finish(state.log);
