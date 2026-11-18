# FamilyGuard AI: security model

This document covers what FamilyGuard protects, who it protects it from, and the controls that do it. Each control lists the test that checks it.

## Reporting a vulnerability

Please don't open a public issue. Email the maintainers at the address in the repository profile, with steps to reproduce. We aim to reply within 3 working days.

## What we protect

| Asset | Why it matters |
|---|---|
| Live location and location history | Physical safety. Exposure enables stalking. |
| Family membership and contacts | Social graph; used for social engineering. |
| SOS alerts | Emergency content; also a target for false alarms or suppression. |
| Sessions and accounts | Taking over an account exposes everything above. |
| Push tokens | Could be used to send spoofed notifications to a device. |
| AI provider keys and service-account credentials | Direct financial cost and full database access. |

## Threats and controls

### 1. Covert tracking (the product's core risk)

FamilyGuard must never become stalkerware.

- **Location only with explicit consent.** Sharing starts only from a user action, the browser's own permission prompt, and the user's choice of which families can see it. Consent is stored in `users/{uid}.sharing` and checked **inside the same transaction** as every location write, so a revoked consent can't race a write. *Tests:* `tests/integration/location.int.test.ts`, `tests/e2e/location.e2e.mjs`.
- **No lookup by phone number or email.** No API takes a phone number or email and returns a location. Invitations reveal nothing about whether an address has an account.
- **Always visible.** A "Sharing live" indicator appears in the app header whenever the device is sending. There is no background or hidden mode, and web geolocation stops when the page is closed. The docs say so.
- **Stopping deletes.** Stopping sharing deletes `locations/{uid}` immediately. History is opt-in and expires through a TTL.
- **Devices are self-registered only.** No discovery of other devices.

### 2. Unauthorised data access (horizontal privilege escalation)

- **Clients cannot write to Firestore at all.** Every write rule is `false`, except marking your own notification read. *Tests:* `tests/rules/*.rules.test.ts` (49 cases).
- **Reads are scoped.** A location is readable only by the owner and members of the families listed in its `sharedWith`. Families, zones and events are readable only by current members. Devices and inboxes are readable only by their owner.
- **Server checks do not rely on the frontend.** Every service function re-checks membership and role from Firestore inside its transaction. Not-member and not-found both return 404, which prevents enumeration. *Tests:* `tests/integration/*.int.test.ts`.
- **The AI only sees what you can see.** The assistant's tools take no arguments, run as the session user, and call the same authorised read functions as the UI. *Tests:* `tests/integration/assistant.int.test.ts`.

### 3. Account takeover and session abuse

- Passwords are handled by Firebase Auth and never stored by us.
- **Session cookie.** The session is an httpOnly, SameSite=Lax (Secure in production) `__session` cookie (Firebase session cookie). It is verified with `checkRevoked=true` on every request. "Sign out everywhere" revokes refresh tokens.
- **Sign-in is time-limited.** The session is only created from an ID token minted within the last 5 minutes.
- **Verified email required.** API mutations need a verified email.
- **Re-authentication for destructive actions.** Account deletion requires a sign-in within the last 5 minutes and typing `DELETE`.
- **CSRF.** The cookie is SameSite=Lax, and every mutating request must carry an `Origin` header matching the host (requests without one are rejected). *Tests:* `tests/api/*.test.ts`.

### 4. Vertical privilege escalation (becoming an admin)

- Admin rights are only the Firebase custom claim `admin: true`. It can be set only with service-account credentials (`scripts/set-admin.mjs`).
- No profile field is consulted. Clients can't write profiles anyway. *Tests:* `tests/rules/security.rules.test.ts`, `tests/security/route-auth.test.ts`.
- **Separate from family roles.** Admin is unrelated to family owner/guardian roles.
- **No personal data in the console.** The admin console shows aggregates and pseudonymous security events only: no locations, names, emails or family content. Every visit and every denied attempt is logged.

### 5. Abuse and denial of service

- **Rate limits.** Sign-in (60/min per IP, 10/min per account), all mutations (30/min per user), SOS, invitations (30/hour) and the AI assistant (10/min, 200/day) are rate-limited.
- **Global counters.** Limits are enforced across every server instance through Firestore counters with hashed keys and TTLs. They fail open to the per-instance limiter if Firestore is down. *Test:* `tests/integration/account.int.test.ts`.
- **SOS deduplication.** A repeated SOS joins the active alert instead of spamming the family.
- **AI cost controls.** Requests have bounded input and output, a 45 s timeout, and one retry.

### 6. Content injection and XSS

- **No raw HTML.** React escapes all output. There is no `dangerouslySetInnerHTML` with user content.
- **Validated input.** All input is validated with Zod at the API boundary. Lengths and value ranges are bounded.
- **Content-Security-Policy** (`src/lib/security/csp.ts`):
  - `default-src 'self'`, `object-src 'none'`, `base-uri 'self'`, `form-action 'self'`, `frame-ancestors 'none'`.
  - External origins are limited to Firebase and Google Maps / sign-in.
  - *Tests:* `tests/security/csp.test.ts`; the E2E suites run under the policy.
- **Known weakness:** `script-src` includes `'unsafe-inline'` (Next.js' inline bootstrap without nonces) and `'unsafe-eval'` (required by the Google Maps JS API). Moving to a nonce-based policy is a future hardening step.
- **Safe push links.** The push service worker only opens same-origin URLs.

### 7. Secrets

- **Server-only modules.** Admin SDK and AI provider modules import `server-only`, so the build fails if client code imports them. AI calls happen only in server routes.
- **Push tokens stay on the server.** They are written by the server and never returned by any API.
- **Secret scan.** `tests/security/secrets.test.ts` scans the tree for private keys and API-key patterns (with a control test proving it catches planted keys). It also checks that no server secret is `NEXT_PUBLIC_` or referenced in a `"use client"` file, and that `.gitignore` excludes env and service-account files.
- **Public client keys.** The Firebase web config and the Maps key are public by design. Restrict the Maps key by HTTP referrer, and rely on Firestore rules for Firebase.

### 8. Privacy of our own logs and data lifecycle

- **Pseudonymous security log.** Events store a salted SHA-256 hash of the uid (`SECURITY_LOG_SALT`) and a truncated IP (/24 IPv4, /48 IPv6). They expire after 90 days.
- **Rate-limit keys** are hashed.
- **Data deletion.** "Delete location data" erases all location data. "Delete my account" erases or anonymises every record about the user, including invitations, SOS acknowledgements, activity, inbox, devices and the auth account. *Test:* `tests/integration/account.int.test.ts` asserts that no document in the main collections still contains the user's uid or email.

## Residual risks and limitations

- **Revocation lag.** A revoked session cookie can be used for up to about a second, until the revocation propagates (Firebase limitation).
- **Background location on the web.** Browsers suspend geolocation in the background, so the web app cannot provide reliable background sharing. This is stated in the UI.
- **Notifications already delivered.** Notifications already delivered to other members (for example "Ann sent an SOS") remain in their inboxes after Ann deletes her account.
- **The rate limiter fails open** when Firestore is unavailable, in favour of availability (SOS must work). The in-memory limit still applies.
- **TTL deletion is asynchronous.** It can take up to 24 hours after expiry, and only works once the TTL policies in the README are enabled.

## Running the security checks

```bash
npm test
```

```bash
npm run test:rules
```

```bash
npm run test:integration
```

```bash
npm audit --omit=dev
```
