#!/usr/bin/env node
/**
 * Runs before `next build` on Vercel production deploys: publishes
 * firestore.rules and firestore.indexes.json to the Firebase project, using
 * the FIREBASE_SERVICE_ACCOUNT key already configured for the server.
 *
 * Talks to the Firestore Admin and Firebase Rules REST APIs directly (the
 * Firebase CLI additionally needs Service Usage permissions that the default
 * Admin SDK service account lacks).
 *
 * Best-effort: it never fails the build. It skips itself when there is no
 * key or when this is not a production deploy, and logs each outcome so it can
 * be checked in the Vercel build log. Safe to re-run: existing indexes are
 * left alone.
 */
import { readFileSync } from "node:fs";
import { cert } from "firebase-admin/app";

const tag = "[firestore-deploy]";
const log = (...a) => console.log(tag, ...a);

async function main() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT?.trim();
  if (!raw) return log("skipped: FIREBASE_SERVICE_ACCOUNT is not set.");
  if (process.env.VERCEL_ENV && process.env.VERCEL_ENV !== "production") {
    return log(`skipped: ${process.env.VERCEL_ENV} deploy (published from production only).`);
  }
  let sa;
  try {
    sa = JSON.parse(raw);
  } catch {
    return log("skipped: FIREBASE_SERVICE_ACCOUNT is not valid JSON.");
  }
  const project = sa.project_id;
  const { access_token: token } = await cert({
    projectId: sa.project_id,
    clientEmail: sa.client_email,
    privateKey: String(sa.private_key).replace(/\\n/g, "\n"),
  }).getAccessToken();

  const call = async (method, url, body) => {
    const r = await fetch(url, {
      method,
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });
    const json = await r.json().catch(() => ({}));
    return { status: r.status, json };
  };
  const errText = (r) => `${r.status} ${r.json?.error?.status ?? ""} ${r.json?.error?.message ?? ""}`.trim();

  // ── Indexes ──────────────────────────────────────────────────────────────
  const db = `https://firestore.googleapis.com/v1/projects/${project}/databases/(default)`;
  const spec = JSON.parse(readFileSync("firestore.indexes.json", "utf8"));
  let created = 0, existing = 0, failed = 0;
  for (const ix of spec.indexes ?? []) {
    const r = await call("POST", `${db}/collectionGroups/${ix.collectionGroup}/indexes`, { queryScope: ix.queryScope, fields: ix.fields });
    if (r.status === 200) created++;
    else if (r.status === 409) existing++;
    else {
      failed++;
      log(`index ${ix.collectionGroup}(${ix.fields.map((f) => f.fieldPath).join(",")}) failed: ${errText(r)}`);
    }
  }
  log(`indexes: ${created} created, ${existing} already existed, ${failed} failed.`);

  for (const fo of spec.fieldOverrides ?? []) {
    const indexes = fo.indexes.map((i) => ({
      queryScope: i.queryScope,
      fields: [{ fieldPath: fo.fieldPath, ...(i.order ? { order: i.order } : { arrayConfig: i.arrayConfig }) }],
    }));
    const r = await call("PATCH", `${db}/collectionGroups/${fo.collectionGroup}/fields/${fo.fieldPath}?updateMask=indexConfig`, {
      indexConfig: { indexes },
    });
    log(`field index ${fo.collectionGroup}.${fo.fieldPath}: ${r.status === 200 ? "OK" : `failed: ${errText(r)}`}`);
  }

  // ── Security rules ───────────────────────────────────────────────────────
  const rulesApi = `https://firebaserules.googleapis.com/v1/projects/${project}`;
  const rs = await call("POST", `${rulesApi}/rulesets`, {
    source: { files: [{ name: "firestore.rules", content: readFileSync("firestore.rules", "utf8") }] },
  });
  if (rs.status !== 200) return log(`rules failed: ${errText(rs)}`);
  const release = { name: `projects/${project}/releases/cloud.firestore`, rulesetName: rs.json.name };
  let rr = await call("PATCH", `${rulesApi}/releases/cloud.firestore`, { release });
  if (rr.status === 404) rr = await call("POST", `${rulesApi}/releases`, release);
  log(`rules: ${rr.status === 200 ? `published (${rs.json.name.split("/").pop()})` : `release failed: ${errText(rr)}`}`);
}

main().catch((e) => log(`FAILED: ${e instanceof Error ? e.message : e}; the build continues.`));
