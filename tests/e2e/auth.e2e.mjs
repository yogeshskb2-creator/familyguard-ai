/**
 * End-to-end auth tests: real browser + real Firebase Auth/Firestore emulators
 * + production build of the app. Run with `npm run test:e2e`.
 */
import { spawn } from "node:child_process";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { AUTH_EMU, BASE, FS_EMU, PORT, PROJECT_ID, e2eEnv } from "./env.mjs";

// CommonJS resolution so a globally installed Playwright (NODE_PATH) also works.
const { chromium } = createRequire(import.meta.url)("playwright");

const results = [];
function skip(name, reason) {
  results.push({ name, ok: true, skipped: true });
  console.log(`  - SKIPPED ${name}\n      ${reason}`);
}
async function step(name, fn) {
  try {
    await fn();
    results.push({ name, ok: true });
    console.log(`  ✓ ${name}`);
  } catch (err) {
    results.push({ name, ok: false });
    console.log(`  ✗ ${name}\n      ${String(err?.message ?? err).split("\n").slice(0, 4).join("\n      ")}`);
  }
}

const emu = (path, init = {}) =>
  fetch(`${AUTH_EMU}${path}`, { ...init, headers: { Authorization: "Bearer owner", "Content-Type": "application/json", ...init.headers } });

async function oobCodes() {
  const r = await emu(`/emulator/v1/projects/${PROJECT_ID}/oobCodes`);
  return (await r.json()).oobCodes ?? [];
}
async function lookupUser(email) {
  const r = await emu(`/identitytoolkit.googleapis.com/v1/projects/${PROJECT_ID}/accounts:lookup`, {
    method: "POST",
    body: JSON.stringify({ email: [email] }),
  });
  return (await r.json()).users?.[0];
}
async function firestoreDoc(path) {
  const r = await fetch(`${FS_EMU}/v1/projects/${PROJECT_ID}/databases/(default)/documents/${path}`, {
    headers: { Authorization: "Bearer owner" },
  });
  return r.ok ? (await r.json()).fields : null;
}

async function waitForServer(url, ms = 60_000) {
  const start = Date.now();
  while (Date.now() - start < ms) {
    try {
      if ((await fetch(url)).ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error("Server did not start");
}

const server = spawn("npx", ["next", "start", "-p", String(PORT)], {
  env: { ...process.env, ...e2eEnv, NODE_ENV: "production" },
  stdio: ["ignore", "pipe", "pipe"],
  detached: true, // own process group, so we can stop npx AND the next-server child
});
const stopServer = () => {
  try {
    process.kill(-server.pid, "SIGTERM");
  } catch {}
};
process.on("exit", stopServer);
let serverLog = "";
server.stdout.on("data", (d) => (serverLog += d));
server.stderr.on("data", (d) => (serverLog += d));

const browser = await chromium.launch();
try {
  await waitForServer(`${BASE}/`);
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const pageErrors = [];
  page.on("pageerror", (e) => pageErrors.push(e.message));

  const email = `ann.${Date.now()}@example.com`;
  const password = "FamilyGuard123";

  console.log("\nProtected routes");
  await step("signed-out visitor to /dashboard is redirected to /login?next=", async () => {
    await page.goto(`${BASE}/dashboard`);
    await page.waitForURL(/\/login\?next=%2Fdashboard/);
  });
  await step("forged session cookie is rejected server-side", async () => {
    await ctx.addCookies([{ name: "__session", value: "forged.jwt.value", url: BASE }]);
    try {
      await page.goto(`${BASE}/settings`);
      await page.waitForURL(/\/login\?next=%2Fsettings/);
    } finally {
      await ctx.clearCookies();
    }
  });

  console.log("\nRegistration & email verification");
  await step("register with email/password → verify-email screen", async () => {
    await page.goto(`${BASE}/register`);
    await page.getByLabel("Your name").fill("Ann Lee");
    await page.getByLabel("Email", { exact: true }).fill(email);
    await page.getByLabel("Password", { exact: true }).fill(password);
    await page.getByLabel("Confirm password").fill(password);
    await page.getByRole("checkbox").check();
    await page.getByRole("button", { name: "Create account" }).click();
    await page.waitForURL(/\/verify-email/);
    await page.getByText(email).waitFor();
  });
  await step("account created in Firebase Auth; no profile until email is verified", async () => {
    // Note: the emulator's "passwordHash" is fake; production Firebase uses scrypt.
    const user = await lookupUser(email);
    assert.ok(user, "user exists in Auth");
    assert.equal(await firestoreDoc(`users/${user.localId}`), null, "no profile before verification");
  });
  await step("verification email was sent", async () => {
    const codes = (await oobCodes()).filter((c) => c.email === email && c.requestType === "VERIFY_EMAIL");
    assert.equal(codes.length, 1);
  });
  await step("unverified user cannot get a session (server refuses)", async () => {
    await page.getByRole("button", { name: /I've verified/ }).click();
    await page.getByText("Not verified yet").waitFor();
    assert.equal((await ctx.cookies()).find((c) => c.name === "__session"), undefined);
  });
  await step("after clicking the email link, user lands on the dashboard", async () => {
    const code = (await oobCodes()).find((c) => c.email === email && c.requestType === "VERIFY_EMAIL");
    const r = await fetch(code.oobLink);
    assert.ok(r.ok, "verification link applied");
    await page.getByRole("button", { name: /I've verified/ }).click();
    await page.waitForURL(/\/dashboard/);
    await page.getByRole("link", { name: "Your profile" }).waitFor();
  });
  await step("session cookie is httpOnly + SameSite=Lax", async () => {
    const c = (await ctx.cookies()).find((c) => c.name === "__session");
    assert.ok(c, "cookie set");
    assert.equal(c.httpOnly, true);
    assert.equal(c.sameSite, "Lax");
    assert.equal(await page.evaluate(() => document.cookie.includes("__session")), false, "not readable by JS");
  });
  let uid;
  await step("profile was created server-side in Firestore", async () => {
    uid = (await lookupUser(email)).localId;
    const doc = await firestoreDoc(`users/${uid}`);
    assert.ok(!Object.keys(doc).some((k) => /pass/i.test(k)), "no password data in Firestore");
    assert.equal(doc.displayName.stringValue, "Ann Lee");
    assert.equal(doc.email.stringValue, email);
    assert.equal(doc.aiProvider.stringValue, "claude");
  });

  console.log("\nUser profile");
  await step("edit display name + AI provider from settings", async () => {
    await page.goto(`${BASE}/settings`);
    await page.getByLabel("Display name").fill("Ann Sharma");
    await page.getByLabel("Preferred AI assistant").selectOption("gemini");
    await page.getByRole("button", { name: "Save changes" }).click();
    await page.getByText("Profile saved.").waitFor();
    const doc = await firestoreDoc(`users/${uid}`);
    assert.equal(doc.displayName.stringValue, "Ann Sharma");
    assert.equal(doc.aiProvider.stringValue, "gemini");
  });
  await step("API rejects privilege escalation (admin/role/familyIds)", async () => {
    const statuses = await page.evaluate(async () => {
      const out = [];
      for (const body of [{ admin: true }, { role: "admin" }, { displayName: "X Y", familyIds: ["f1"] }]) {
        const r = await fetch("/api/profile", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
        out.push(r.status);
      }
      return out;
    });
    assert.deepEqual(statuses, [400, 400, 400]);
    const doc = await firestoreDoc(`users/${uid}`);
    assert.equal(doc.admin, undefined);
    assert.equal(doc.role, undefined);
  });
  await step("cross-site request is rejected (CSRF)", async () => {
    const cookie = (await ctx.cookies()).find((c) => c.name === "__session");
    const r = await fetch(`${BASE}/api/profile`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Origin: "https://evil.example", Cookie: `__session=${cookie.value}` },
      body: JSON.stringify({ displayName: "Hacked" }),
    });
    assert.equal(r.status, 403);
  });

  console.log("\nAdmin separation");
  await step("regular user is denied the admin console", async () => {
    await page.goto(`${BASE}/admin`);
    await page.getByText("Administrator access required").waitFor();
  });

  console.log("\nLogout & login");
  let oldCookie;
  await step("sign out clears the session and re-protects routes", async () => {
    oldCookie = (await ctx.cookies()).find((c) => c.name === "__session").value;
    await page.goto(`${BASE}/settings`);
    await page.getByRole("button", { name: "Sign out", exact: true }).click();
    await page.waitForURL(/\/login/);
    assert.equal((await ctx.cookies()).find((c) => c.name === "__session"), undefined);
    await page.goto(`${BASE}/dashboard`);
    await page.waitForURL(/\/login/);
  });
  await step("wrong password shows a generic error", async () => {
    await page.getByLabel("Email", { exact: true }).fill(email);
    await page.getByLabel("Password").fill("WrongPass999");
    await page.getByRole("button", { name: "Sign in" }).click();
    await page.getByText("Email or password is incorrect.").waitFor();
  });
  await step("unknown email shows the SAME generic error (no enumeration)", async () => {
    await page.getByLabel("Email", { exact: true }).fill("nobody-here@example.com");
    await page.getByRole("button", { name: "Sign in" }).click();
    await page.getByText("Email or password is incorrect.").waitFor();
  });
  await step("login honours ?next= and blocks open redirects", async () => {
    await page.goto(`${BASE}/login?next=${encodeURIComponent("https://evil.example")}`);
    await page.getByLabel("Email", { exact: true }).fill(email);
    await page.getByLabel("Password").fill(password);
    await page.getByRole("button", { name: "Sign in" }).click();
    await page.waitForURL(`${BASE}/dashboard`);
  });
  await step("sign out everywhere revokes previously issued sessions", async () => {
    const current = (await ctx.cookies()).find((c) => c.name === "__session").value;
    // Firebase stores revocation time in whole seconds and treats auth_time == validSince
    // as valid, so a session minted in the same second as the revoke survives it.
    await new Promise((r) => setTimeout(r, 1100));
    page.once("dialog", (d) => d.accept());
    await page.goto(`${BASE}/settings`);
    await page.getByRole("button", { name: "Sign out everywhere" }).click();
    await page.waitForURL(/\/login/);
    for (const stale of [oldCookie, current]) {
      const other = await browser.newContext();
      await other.addCookies([{ name: "__session", value: stale, url: BASE }]);
      const p = await other.newPage();
      await p.goto(`${BASE}/dashboard`);
      await p.waitForURL(/\/login/);
      await other.close();
    }
  });

  console.log("\nAdmin custom claim");
  await step("admin claim (set via Admin API only) grants the admin console", async () => {
    const r = await emu(`/identitytoolkit.googleapis.com/v1/projects/${PROJECT_ID}/accounts:update`, {
      method: "POST",
      body: JSON.stringify({ localId: uid, customAttributes: JSON.stringify({ admin: true }) }),
    });
    assert.ok(r.ok);
    await page.goto(`${BASE}/login?next=%2Fadmin`);
    await page.getByLabel("Email", { exact: true }).fill(email);
    await page.getByLabel("Password").fill(password);
    await page.getByRole("button", { name: "Sign in" }).click();
    await page.waitForURL(/\/admin/);
    await page.getByText("Admin console").waitFor();
    await emu(`/identitytoolkit.googleapis.com/v1/projects/${PROJECT_ID}/accounts:update`, {
      method: "POST",
      body: JSON.stringify({ localId: uid, customAttributes: "{}" }),
    });
  });

  console.log("\nPassword reset");
  await step("reset email is sent and the new password works", async () => {
    await page.goto(`${BASE}/settings`);
    await page.getByRole("button", { name: "Sign out", exact: true }).click();
    await page.waitForURL(/\/login/);
    await page.goto(`${BASE}/forgot-password`);
    await page.getByLabel("Email", { exact: true }).fill(email);
    await page.getByRole("button", { name: "Send reset link" }).click();
    await page.getByText("Check your inbox").waitFor();
    const code = (await oobCodes()).find((c) => c.email === email && c.requestType === "PASSWORD_RESET");
    assert.ok(code, "reset code issued");
    const newPassword = "NewSecret456";
    const r = await fetch(`${AUTH_EMU}/identitytoolkit.googleapis.com/v1/accounts:resetPassword?key=demo-api-key`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ oobCode: code.oobCode, newPassword }),
    });
    assert.ok(r.ok, "password reset applied");
    await page.goto(`${BASE}/login`);
    await page.getByLabel("Email", { exact: true }).fill(email);
    await page.getByLabel("Password").fill(newPassword);
    await page.getByRole("button", { name: "Sign in" }).click();
    await page.waitForURL(/\/dashboard/);
  });
  await step("reset form gives the same answer for unknown emails", async () => {
    await page.goto(`${BASE}/forgot-password`);
    await page.getByLabel("Email", { exact: true }).fill("nobody-here@example.com");
    await page.getByRole("button", { name: "Send reset link" }).click();
    await page.getByText("Check your inbox").waitFor();
  });

  console.log("\nPhone OTP");
  await step("sign in with phone number + SMS code", async () => {
    const pctx = await browser.newContext();
    const p = await pctx.newPage();
    await p.goto(`${BASE}/login`);
    await p.getByRole("tab", { name: /phone/i }).click();
    const phone = `+1555${String(Date.now()).slice(-7)}`;
    await p.getByLabel("Mobile number").fill(phone);
    await p.getByRole("button", { name: "Send code" }).click();
    await p.getByLabel(/Code sent to/).waitFor({ timeout: 15_000 });
    const r = await emu(`/emulator/v1/projects/${PROJECT_ID}/verificationCodes`);
    const code = (await r.json()).verificationCodes.find((c) => c.phoneNumber === phone).code;
    await p.getByLabel(/Code sent to/).fill(code);
    await p.getByRole("button", { name: /Verify/ }).click();
    await p.waitForURL(/\/dashboard/);
    await pctx.close();
  });

  console.log("\nGoogle sign-in");
  // Firebase's popup flow must load https://apis.google.com/js/api.js even with the emulator.
  const gapiReachable = await fetch("https://apis.google.com/js/api.js").then((r) => r.ok, () => false);
  if (!gapiReachable) skip("sign in with Google (emulator IdP popup)", "apis.google.com is not reachable from this machine");
  else await step("sign in with Google (emulator IdP popup)", async () => {
    const gctx = await browser.newContext();
    const p = await gctx.newPage();
    await p.goto(`${BASE}/login`);
    const [popup] = await Promise.all([
      p.waitForEvent("popup"),
      p.getByRole("button", { name: "Continue with Google" }).click(),
    ]);
    await popup.waitForLoadState();
    await popup.getByText("Add new account").click();
    await popup.getByText("Auto-generate user information").click().catch(() => {});
    await popup.locator("#email-input, input[type=email]").first().fill(`g.${Date.now()}@gmail.com`).catch(() => {});
    await popup.locator("#display-name-input").fill("Gita Rao").catch(() => {});
    await popup.getByText("Sign in with Google.com").click();
    await p.waitForURL(/\/dashboard/, { timeout: 20_000 });
    await gctx.close();
  });

  await step("no uncaught browser errors", async () => {
    assert.deepEqual(pageErrors, []);
  });
} finally {
  await browser.close();
  stopServer();
}

const failed = results.filter((r) => !r.ok);
const skipped = results.filter((r) => r.skipped).length;
console.log(`\n${results.length - failed.length - skipped}/${results.length} E2E checks passed, ${skipped} skipped, ${failed.length} failed`);
if (failed.length) {
  console.log("\n--- server log (tail) ---\n" + serverLog.split("\n").slice(-30).join("\n"));
  process.exit(1);
}
