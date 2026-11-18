import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { AUTH_EMU, BASE, PORT, PROJECT_ID, e2eEnv } from "./env.mjs";

export const { chromium } = createRequire(import.meta.url)("playwright");

export const results = [];
export async function step(name, fn) {
  try {
    await fn();
    results.push({ name, ok: true });
    console.log(`  ✓ ${name}`);
  } catch (err) {
    results.push({ name, ok: false });
    console.log(`  ✗ ${name}\n      ${String(err?.message ?? err).split("\n").slice(0, 4).join("\n      ")}`);
  }
}

export function finish(serverLog = "") {
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed, ${failed.length} failed`);
  if (failed.length) {
    console.log("\n--- server log (tail) ---\n" + serverLog.split("\n").slice(-30).join("\n"));
    process.exitCode = 1;
  }
}

export function startServer() {
  const server = spawn("npx", ["next", "start", "-p", String(PORT)], {
    env: { ...process.env, ...e2eEnv, NODE_ENV: "production" },
    stdio: ["ignore", "pipe", "pipe"],
    detached: true,
  });
  const state = { log: "" };
  server.stdout.on("data", (d) => (state.log += d));
  server.stderr.on("data", (d) => (state.log += d));
  const stop = () => {
    try {
      process.kill(-server.pid, "SIGTERM");
    } catch {}
  };
  process.on("exit", stop);
  return { state, stop };
}

export async function waitForServer(ms = 60_000) {
  const start = Date.now();
  while (Date.now() - start < ms) {
    try {
      if ((await fetch(`${BASE}/`)).ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error("Server did not start");
}

const H = { "Content-Type": "application/json", Authorization: "Bearer owner" };
const IDT = `${AUTH_EMU}/identitytoolkit.googleapis.com/v1`;

/** Create an email-verified account directly in the Auth emulator. */
export async function createVerifiedUser(email, password, displayName) {
  const r = await fetch(`${IDT}/accounts:signUp?key=demo-api-key`, {
    method: "POST",
    headers: H,
    body: JSON.stringify({ email, password, displayName, returnSecureToken: true }),
  }).then((x) => x.json());
  await fetch(`${IDT}/projects/${PROJECT_ID}/accounts:update`, {
    method: "POST",
    headers: H,
    body: JSON.stringify({ localId: r.localId, emailVerified: true, displayName }),
  });
  return r.localId;
}

/** A fresh browser context signed in through the real login form. */
export async function signedInPage(browser, email, password) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto(`${BASE}/login`);
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(/\/dashboard/);
  return { ctx, page };
}
