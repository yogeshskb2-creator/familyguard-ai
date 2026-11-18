/** Seeds a demo family on the emulators and screenshots every screen. Not a test. */
import { mkdirSync } from "node:fs";
import { AUTH_EMU, BASE, PROJECT_ID } from "./env.mjs";
import { chromium, createVerifiedUser, startServer, waitForServer } from "./harness.mjs";

const OUT = process.env.SHOTS_DIR;
mkdirSync(OUT, { recursive: true });
const { stop } = startServer();
const browser = await chromium.launch();
const pw = "FamilyGuard123";
const IDT = `${AUTH_EMU}/identitytoolkit.googleapis.com/v1`;
const HOME = { latitude: 12.9716, longitude: 77.5946 }; // Bengaluru

const api = (page, path, init = {}) =>
  page.evaluate(
    async ({ path, init }) => {
      const r = await fetch(path, { method: init.method ?? "GET", headers: init.body ? { "Content-Type": "application/json" } : undefined, body: init.body ? JSON.stringify(init.body) : undefined });
      return { status: r.status, json: await r.json().catch(() => null) };
    },
    { path, init },
  );
async function login(email, opts = {}) {
  const ctx = await browser.newContext({ viewport: opts.viewport ?? { width: 1440, height: 900 }, deviceScaleFactor: 2, ...(opts.device ?? {}), permissions: ["geolocation"], geolocation: opts.geo ?? { ...HOME, accuracy: 15 } });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/login`);
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password").fill(pw);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(/\/dashboard/);
  return { ctx, page };
}
const shot = async (page, name, full = true) => {
  await page.waitForLoadState("networkidle").catch(() => {});
  if (full) {
    // Scroll through so scroll-triggered (whileInView) sections animate in, as for a real visitor.
    await page.evaluate(async () => {
      for (let y = 0; y < document.body.scrollHeight; y += 400) {
        window.scrollTo(0, y);
        await new Promise((r) => setTimeout(r, 120));
      }
      window.scrollTo(0, 0);
    });
  }
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: full });
  console.log("  shot", name);
};

try {
  await waitForServer();
  // Public pages first (signed out).
  const anon = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
  const ap = await anon.newPage();
  for (const [p, n] of [["/", "01-landing"], ["/login", "02-login"], ["/register", "03-register"]]) {
    await ap.goto(`${BASE}${p}`);
    await shot(ap, n, p === "/");
  }

  const people = { priya: "Priya Sharma", rahul: "Rahul Sharma", anaya: "Anaya Sharma", dadi: "Kamla Sharma" };
  const u = {};
  for (const [k, name] of Object.entries(people)) {
    u[k] = { email: `${k}@demo.familyguard.app`, name };
    u[k].uid = await createVerifiedUser(u[k].email, pw, name);
  }
  await fetch(`${IDT}/projects/${PROJECT_ID}/accounts:update`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer owner" },
    body: JSON.stringify({ localId: u.priya.uid, customAttributes: JSON.stringify({ admin: true }) }),
  });
  const geo = {
    priya: { latitude: 12.9716, longitude: 77.5946, accuracy: 12 },
    rahul: { latitude: 12.9352, longitude: 77.6245, accuracy: 20 }, // Koramangala office
    anaya: { latitude: 12.9784, longitude: 77.6408, accuracy: 18 }, // Indiranagar school
    dadi: { latitude: 12.9719, longitude: 77.5949, accuracy: 25 },
  };
  const S = {};
  for (const k of Object.keys(people)) S[k] = await login(u[k].email, { geo: geo[k] });
  const P = S.priya.page;
  const fam = (await api(P, "/api/families", { method: "POST", body: { name: "Sharma Family" } })).json.family.id;
  for (const [k, role] of [["rahul", "guardian"], ["anaya", "member"], ["dadi", "member"]]) {
    const inv = (await api(P, `/api/families/${fam}/invitations`, { method: "POST", body: { email: u[k].email, role } })).json.invitation;
    await api(S[k].page, `/api/invitations/${inv.id}`, { method: "POST", body: { action: "accept" } });
  }
  for (const z of [
    { name: "Home", kind: "home", lat: 12.9716, lng: 77.5946, radius: 150 },
    { name: "Anaya's School", kind: "school", lat: 12.9784, lng: 77.6408, radius: 250 },
    { name: "Rahul's Office", kind: "office", lat: 12.9352, lng: 77.6245, radius: 200 },
  ]) await api(P, `/api/families/${fam}/geofences`, { method: "POST", body: { ...z, alertsEnabled: true, notifyOnEnter: true, notifyOnExit: true } });
  for (const k of ["rahul", "anaya", "dadi", "priya"]) {
    await api(S[k].page, "/api/sharing", { method: "POST", body: { familyIds: [fam], keepHistory: k === "priya", historyRetentionDays: 7 } });
    // The app's own sharing loop sends the location, as on a real phone.
    await Promise.all([
      S[k].page.waitForResponse((r) => r.url().endsWith("/api/location") && r.request().method() === "POST", { timeout: 30_000 }),
      S[k].page.reload(),
    ]);
  }
  await api(S.anaya.page, "/api/sos", { method: "POST", body: { message: "Missed the school bus, please call me" } });
  await api(P, "/api/devices", { method: "POST", body: { name: "Priya's Pixel", type: "android", platform: "Chrome on Android" } });
  await api(P, "/api/devices", { method: "POST", body: { name: "Home laptop", type: "web", platform: "Chrome on Windows" } });

  console.log("Desktop");
  const pages = [
    ["/dashboard", "10-dashboard"], ["/map", "11-map"], ["/family", "12-family"], [`/family/${fam}`, "13-family-detail"],
    [`/family/${fam}/members/${u.anaya.uid}`, "14-member"], ["/sos", "15-sos"], ["/geofences", "16-safe-zones"],
    ["/notifications", "17-notifications"], ["/devices", "18-devices"], ["/settings", "20-settings"], ["/admin", "21-admin"],
  ];
  for (const [p, n] of pages) {
    await P.goto(`${BASE}${p}`);
    await shot(P, n);
  }
  await P.goto(`${BASE}/assistant`);
  // The test environment has deliberately fake AI keys; "Quick answers" needs none.
  await P.getByRole("radio", { name: /Quick answers/ }).check();
  for (const q of ["Show members currently sharing location", "Summarize family safety activity"]) {
    await Promise.all([P.waitForResponse((r) => r.url().endsWith("/api/assistant")), P.getByRole("button", { name: q }).click()]);
  }
  await shot(P, "19-assistant");

  console.log("Mobile");
  const M = await login(u.priya.email, { device: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }, geo: geo.priya });
  for (const [p, n] of [["/dashboard", "30-mobile-dashboard"], ["/map", "31-mobile-map"], ["/sos", "32-mobile-sos"], ["/family", "33-mobile-family"]]) {
    await M.page.goto(`${BASE}${p}`);
    await shot(M.page, n, false);
  }
} finally {
  await browser.close();
  stop();
}
