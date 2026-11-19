# FamilyGuard AI

A consent-based family safety and location sharing platform.

FamilyGuard AI is **not a tracker**. A person's location is shared only after they press **Share**, the browser asks for permission, and they pick which family groups can see it. They can stop sharing at any time. It cannot locate anyone by phone number or email, and it never runs hidden.

## Status

| Phase | Scope | Status |
|---|---|---|
| 1 | Project setup, design system, app shell, landing page, dashboard UI | ✅ Done |
| 2 | Firebase Auth (email/password, Google, phone OTP), profiles, protected routes | ✅ Done |
| 3 | Family groups and invitations | ✅ Done |
| 4 | Consent-based location sharing | ✅ Done |
| 5 | Google Maps | ✅ Done |
| 6 | SOS and geofencing | ✅ Done |
| 7 | AI assistant (Claude / OpenAI / Gemini) | ✅ Done |
| 8 | Notifications (FCM) and device management | ✅ Done |
| 9 | Security hardening, rules tests, admin console, account deletion | ✅ Done |
| 10 | Production deployment | ⏳ Next |

The dashboard shows **sample data** with a visible "Preview mode" banner until Firebase is configured. Routes for later phases show a "planned scope" screen rather than fake functionality.

## Tech stack

Next.js 15 (App Router) · React 19 · TypeScript (strict) · Tailwind CSS 4 · Framer Motion · Lucide · Recharts · Firebase (Auth, Firestore, FCM) · Zod · Vitest + Testing Library

## Getting started

Requires Node.js 20 or newer.

```bash
npm install
```

```bash
cp .env.example .env.local
```

```bash
npm run dev
```

Open http://localhost:3000. The app runs without credentials in preview mode.

### Scripts

| Command | Purpose |
|---|---|
| `npm run dev` | Development server |
| `npm run build` | Production build (also lints and type-checks) |
| `npm start` | Serve the production build |
| `npm run lint` | ESLint |
| `npm run typecheck` | TypeScript, no emit |
| `npm test` | Unit, component and API-route tests (Vitest) |
| `npm run test:rules` | Firestore security-rules tests against the Firestore emulator (needs Java 11+) |
| `npm run test:integration` | Server-side family logic against the real Auth and Firestore emulators |
| `npm run test:e2e` | Browser end-to-end tests (auth, and family management with several users): production build + emulators + Playwright |
| `npm run test:all` | Everything above, in order |

## Firebase setup

1. Create a project at https://console.firebase.google.com.
2. **Add a Web app** (Project settings → Your apps → `</>`). Copy the config values into the `NEXT_PUBLIC_FIREBASE_*` variables in `.env.local`.
3. **Authentication → Sign-in method**: enable **Email/Password**, **Google** and **Phone**. Add your production domain under **Authorized domains**.
4. **Firestore Database**: create it in production mode, in a region near your users.
5. **Service account for the server**: Project settings → Service accounts → *Generate new private key*. Copy `project_id`, `client_email` and `private_key` into `FIREBASE_ADMIN_*`. Keep the JSON file out of the repository; `.gitignore` already excludes `service-account*.json`.
6. **Cloud Messaging** (Phase 8): Project settings → Cloud Messaging → Web Push certificates → generate a key pair, and put it in `NEXT_PUBLIC_FIREBASE_VAPID_KEY`.
7. Deploy rules and indexes with the Firebase CLI:

```bash
npm i -g firebase-tools
```

```bash
firebase login
```

```bash
cp .firebaserc.example .firebaserc
```

Edit `.firebaserc` to set your project ID, then:

```bash
firebase deploy --only firestore:rules,firestore:indexes
```

> `firestore.rules` currently **denies all access**. Collection rules are added in the phase that introduces each collection, so nothing is exposed while features are being built.

### Local emulators

```bash
firebase emulators:start
```

This starts the Auth emulator on :9099, Firestore on :8080, and the UI on :4000. The security-rules test suite (Phase 9) runs against these.

### Developing against the emulators (no real Firebase project needed)

Put this in `.env.local`. A `demo-` project ID never contacts real Firebase.

```
NEXT_PUBLIC_FIREBASE_API_KEY=demo-api-key
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=localhost
NEXT_PUBLIC_FIREBASE_PROJECT_ID=demo-familyguard
NEXT_PUBLIC_FIREBASE_APP_ID=1:000000000000:web:demo
NEXT_PUBLIC_USE_FIREBASE_EMULATORS=true
FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099
FIRESTORE_EMULATOR_HOST=127.0.0.1:8080
```

Then run each of these in its own terminal:

```bash
npx firebase emulators:start --only auth,firestore --project demo-familyguard
```

```bash
npm run dev
```

Verification and reset emails are not sent. They are listed at http://127.0.0.1:9099/emulator/v1/projects/demo-familyguard/oobCodes. SMS codes are listed at `/verificationCodes` on the same host.

## Authentication architecture

1. The browser signs in with the Firebase JS SDK: email and password, Google popup, or phone number with an SMS code and invisible reCAPTCHA.
2. The browser sends its fresh ID token to `POST /api/auth/session`. The server then:
   - checks the request comes from the same origin (CSRF protection),
   - rate-limits by IP,
   - verifies the token with the Admin SDK, including a revocation check,
   - requires the sign-in to be less than 5 minutes old,
   - **refuses email/password accounts whose email isn't verified**,
   - creates the `users/{uid}` profile (server-side only),
   - sets an **httpOnly, SameSite=Lax `__session` cookie**, valid for 5 days.
3. Protected routes are checked twice:
   - `src/middleware.ts` quickly redirects visitors who have no cookie.
   - `requireViewer()` in the server layout and pages verifies the cookie cryptographically and checks for revocation. Forged, expired and revoked cookies are redirected to `/login?next=…`, and `next` is sanitised against open redirects.
4. Logout: `DELETE /api/auth/session` clears the cookie. `?scope=all` ("Sign out everywhere") also revokes every refresh token for the account.
5. Profile edits go through `PATCH /api/profile`, which accepts only `displayName` and `aiProvider`. Firestore rules enforce the same whitelist.
6. **Admins**: admin access comes from the `admin: true` custom claim, which can only be set with service-account credentials:

```bash
node --env-file=.env.local scripts/set-admin.mjs grant person@example.com
```

Known limits:
- The rate limiter is in-memory, so each server instance counts separately. Use Redis or Upstash if you need one global limit.
- Firebase records revocation in whole seconds, so a session created in the same second as "sign out everywhere" survives it.
- Login error messages are generic, but Firebase's own sign-up API can still reveal whether an email is registered. To close that, turn on **Email enumeration protection** in Firebase Console → Authentication → Settings.

## Family management

| Action | Owner | Guardian | Member |
|---|---|---|---|
| View family and members (name, role, colour; never email or phone) | ✓ | ✓ | ✓ |
| Invite | guardians and members | members only | — |
| See and revoke pending invitations | ✓ | ✓ | — |
| Change roles (guardian ↔ member) | ✓ | — | — |
| Remove | anyone except self | members only | — |
| Leave | — (delete the family instead) | ✓ | ✓ |
| Rename or delete the family | ✓ | — | — |

- **Invitations** go to an email address or phone number and expire after 7 days. The invitee sees them after signing in with that **verified** email, or with that phone number via SMS. Nobody joins without pressing **Accept**. An invitation looks the same whether or not the person already has an account, so invites can't be used to find out who uses FamilyGuard.
- **All writes are made on the server** (`src/lib/families/service.server.ts`). Each one re-reads the family inside a Firestore transaction and works out the caller's role from that fresh copy. Firestore rules give clients **read-only** access: members can read their family, and the invitee plus owners and guardians can read invitations. No client can write to these collections.
- **Removal takes effect immediately**: every read checks the current `memberIds` list.
- **Limits**: 5 families per user, 20 members per family, 20 pending invitations per family.
- **Join links** (the default way to invite): every invitation gets a private, single-use link (`/join/<token>`, 24 random bytes) that the inviter can copy or send on WhatsApp. Email and phone are optional. Whoever opens the link and signs in sees the family and inviter, and joins only by pressing **Join**. The page then offers to start sharing location with that family, which is still a separate, explicit choice. Only a SHA-256 of the token is stored. The raw link is shown once to the inviter. "New link" replaces it, and the old one stops working. A link dies when it is used, declined, revoked or expires. Sign-up, email verification and sign-in all return to the link (`?next=`).
- **Email delivery**: invitation emails and SMS are **not sent**. Send the join link yourself (Copy link / Send on WhatsApp). An invitee who signs in with the invited verified email or phone also sees the invitation on the Family page.

## Location sharing and consent

**Nothing is collected until the user opts in.** Until then the app doesn't call the browser's Geolocation API at all. The E2E suite checks this, with location permission already granted.

1. **Opt in.** Settings → Location sharing:
   - The user ticks which families may see them, and whether to keep a private history (1, 7 or 30 days).
   - They press **Share my location**. The browser asks for permission; if it's denied, **no consent is stored**.
   - Consent is saved on the server in `users/{uid}.sharing`, which clients can't write.
2. **Updates.**
   - **What is sent:** the browser sends at most one fix every 15 s, only when you have moved, plus a heartbeat every 60 s.
   - **What the server checks:** consent must be active *in the same transaction* as the write. Fixes that are stale, from the future, malformed or come too quickly are rejected. Only the families the user chose, and still belongs to, are stamped on the location in `sharedWith`.
3. **Always-visible indicator.** The top bar shows one of:
   - Not sharing
   - Sharing live
   - Sharing · paused here (consent is on but this device isn't sending)
   - Location blocked
4. **Stop.**
   - **Stop sharing** revokes consent and **deletes** `locations/{uid}` straight away.
   - A tab that is still open elsewhere gets `409 not_sharing` on its next update and switches itself off.
   - Leaving or being removed from a family withdraws your location from that family in the same transaction. Leaving your last shared family stops sharing entirely.
5. **Who can see a location.**
   - **Live location:** the owner, plus current members of the families in `sharedWith`. Firestore rules check this against the viewer's *current* memberships.
   - **History:** the owner only. There is no API that returns anyone else's history.
6. **History is opt-in.**
   - A point is stored only after a move of 50 m or more, or every 5 minutes.
   - Each point carries `expireAt`.
   - The user can delete all of it at any time.

> **Enable the TTL policy** so expired history is deleted automatically: Firebase console → Firestore → TTL → collection group `points`, field `expireAt`. The app also removes expired points whenever new ones are written, as a backstop. TTL deletion can lag by up to 24 hours.

**Browser limitations (stated in the UI as well).** Web location only works while FamilyGuard is open: browsers pause or stop it when the tab is closed or in the background. Family members then see the **last known** location, with "Last seen … ago" and Offline (no update for 2 minutes or more). Geolocation also needs HTTPS (or `localhost`). Reliable background sharing needs the native Android app, which is planned separately.

## Emergency SOS

- **An alert needs a deliberate, confirmed action.** Press SOS, review the confirmation (which families, how many people, whether to include your location, an optional message), then press **Send**. Nothing in the system ever sends an alert by itself.
- **Recipients** are the *current* members of the families you chose. Each gets a critical in-app notification, and an **app-wide red banner** appears on every page they open while the alert is active. Phone push notifications come in Phase 8.
- **Location** is a one-time snapshot attached to that alert, and only if you leave "Include my current location" switched on. It does **not** turn on location sharing. If your device can't get a position within 8 seconds, the SOS goes out anyway and says it was sent without a location.
- **Responding to an alert:**
  - Recipients press **I've seen this**, and the sender sees who has seen it.
  - The sender can mark **I'm safe** (resolved) or **Cancel — false alarm**.
  - A family owner or guardian can also mark an alert resolved.
- **Duplicates and floods are prevented.** Pressing SOS again while one is active updates the existing alert. There's a limit of 3 alerts per 10 minutes, and the error message says to call your emergency number.
- **Emergency contacts** (up to 5) and your local emergency number (112 by default) are private to you. FamilyGuard does **not** text or call them automatically; they're one-tap `tel:` links. The SOS page also reminds you to call emergency services first if you're in immediate danger.
- **History:** alerts are visible only to the sender and to current members of the families that were alerted.

## Safe zones (geofencing)

- Owners and guardians create zones (Home, School, Office, College or Other) with a radius from 50 m to 50 km (quick picks: 200 m … 25 km). A zone applies to **everyone** or only to **chosen members**. The centre can be set from your current position (used only to fill in the form), a member's shared location, or coordinates you type. Members can view zones but can't change them.
- **Zones are checked on the server, inside the same transaction that stores a location update**, and only for the families that person is **sharing with**. Zones of other families are never even loaded.
- **Alerts don't fire on GPS noise:**
  - "Arrived" fires only when a position is clearly inside the zone.
  - "Left" fires only when a position is beyond the radius plus a buffer (25 m, or the fix's accuracy if larger).
  - Positions less precise than the zone itself are ignored.
  - Nobody gets "arrived" just because someone turned sharing on while already inside.
- **Alarm when leaving** (per zone): when a watched member leaves, every owner and guardian gets a critical alarm. That is an app-wide red banner with a siren and vibration on every page, an urgent push that stays on screen, and the distance from the centre with a "Where" link. It rings until each of them presses **I've seen this**, and stops for everyone when the person is back inside (owners are told "X is back inside"). Turning the alarm off or deleting the zone silences open alarms. Alarms live in `zoneAlarms/` (server-only). Browsers only play sound after the page has been used once, so the banner offers **Turn on alarm sound** when needed.
- The Safe Zones page shows, for each zone, who is inside or outside right now and how far away.
- Each zone has its own switches: **Alerts**, **On arrival**, **On leaving** and **Alarm when leaving**. Arrivals and departures are always logged to the family's activity feed. Notifications go to everyone in the family except the person who moved.
- **On the web, location only updates while FamilyGuard is open**, so arrivals can be reported late or missed. The page says so. The native Android app is the path to reliable geofencing.

## Notifications and push

**In-app inbox:** `notifications/{uid}/items`, written by the server only. You can read only your own, and the only change you can make is marking items read. The bell in the top bar shows the unread count.

**What creates notifications:**

| Category (`/notifications` → push settings) | Notifications |
|---|---|
| Emergency SOS | An SOS from family (critical: it stays on screen until handled); acknowledgements of your own SOS; SOS resolved or cancelled |
| Safe zones | Arrivals and departures, according to each zone's own switches |
| Invitations | "X invited you to Family", sent **only** if an account exists for a **verified** email or phone. The inviter's response is the same either way, so invitations can't be used to find out who has an account |
| Location sharing | "X started / stopped sharing their location", once per change |
| Your devices | Security alerts when a device is added to or removed from your account |

**Push delivery (Firebase Cloud Messaging):**

1. A notification is written inside the same database transaction as the event that caused it. Its push is queued in an **outbox** that is cleared at the start of every transaction attempt and sent only **after commit**. A retried transaction never sends duplicates, and a failed one sends nothing.
2. Pushes go only to devices the user **registered and turned push on for**, and only for categories they haven't switched off. The in-app inbox always records everything.
3. Expired or uninstalled push tokens are switched off automatically. Delivery is best-effort and never blocks or fails the original action.
4. The service worker (`public/firebase-messaging-sw.js`) shows notifications and only ever opens pages of this app. A link to an outside site in a push payload is ignored.

**Setup:** in the Firebase console, go to Project settings → Cloud Messaging → Web Push certificates, generate a key pair, and set `NEXT_PUBLIC_FIREBASE_VAPID_KEY`. Without it, the Devices page explains that push isn't configured; the in-app inbox still works. On iPhone and iPad, web push works only after "Add to Home Screen", and the app says so.

## Devices

`/devices` shows:
- **Account status:** active, email verified, sign-in method, and whether location sharing is on.
- **This device:** register it, rename it, and turn push on or off.
- **Every device you've registered,** with type, a short platform label such as "Chrome on Android" (never the full browser identification string), last active time, push on or off, and whether it is **sending your location**. Location updates carry the sending device's ID, and only your own devices can be marked.

**Remove** revokes a device. Its push token is deleted at once, so it gets no more pushes, and it forgets itself on its next check-in. Devices are owner-only: other users get 404, there are no client writes, and push tokens are never returned to any browser. FamilyGuard never discovers or accesses devices you didn't register yourself.

## Google Maps setup

1. In Google Cloud Console, enable the **Maps JavaScript API** and make sure **billing** is on.
2. Create an API key and **restrict it**:
   - **Application restrictions:** HTTP referrers, listing your domains (for example `https://your-app.vercel.app/*` and `http://localhost:3000/*`).
   - **API restrictions:** Maps JavaScript API only.
3. Set `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`. This key is *meant* to be public, and the referrer restriction is what protects it.
4. Optional but recommended: create a **vector Map ID** (Google Maps Platform → Map management) and set `NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID`. Without one, the app uses Google's `DEMO_MAP_ID`, which is fine for development.

### What the map does

**`/map`** has:
- one colour-coded marker per member sharing with the selected family, pulsing while they're online and dimmed for last-known locations,
- an accuracy circle around each marker,
- a popup with name, role, Online or Offline, last update, accuracy and time, plus Directions and Profile links,
- Google's zoom controls, **Fit everyone** and **My location**,
- a member list that pans the map to a person,
- a family picker if you belong to several families.

**The dashboard** shows a compact version of the same map.

**My location** shows your position **on your own screen only**. It never sends anything to the server, and sharing stays a separate, explicit choice. The E2E suite checks this.

### When Google Maps can't load

The map falls back to a clearly labelled **schematic view** in any of these cases:
- the key is missing,
- Google rejects the key (detected through Google's `gm_authFailure` hook),
- the tiles don't load within 15 seconds,
- Google's map code throws an error. An error boundary contains it, so only the map falls back and the rest of the page keeps working.

The schematic shows **real, to-scale relative positions**: north is up, distances are equal in both directions, and there's a scale bar and zoom controls. It doesn't show streets.

The E2E suite runs the **real Google Maps loader with an invalid key**, so this fallback is tested against Google itself.

## AI assistant

On `/assistant`, users pick **Claude**, **OpenAI** or **Gemini**, or **Quick answers**, which uses no AI at all. Their choice is saved on their profile.

### Configuration (server-only)

| Variable | Provider | Default model (override) |
|---|---|---|
| `ANTHROPIC_API_KEY` | Claude, via the official `@anthropic-ai/sdk` | `claude-opus-5-5` (`CLAUDE_MODEL`) |
| `OPENAI_API_KEY` | OpenAI, via the official `openai` SDK (Chat Completions + function calling) | `gpt-5.5` (`OPENAI_MODEL`) |
| `GEMINI_API_KEY` | Google Gemini, via the official `@google/genai` SDK | `gemini-3.8-flash` (`GEMINI_MODEL`) |

The OpenAI and Gemini defaults are names the installed SDKs list. **Confirm them against each provider's current model list** before going live, and override them with the env vars if needed.

Claude runs at `effort: "low"`, which is fast and cheap for chat (thinking can't be turned off on this model; effort is the control). It has **server-side refusal fallback** enabled (`fallbacks: "default"`, beta `server-side-fallback-2026-07-01`): if a safety classifier declines a request, the API retries it on a fallback model within the same call. Remove those two fields if you don't want this.

### How it works

1. The browser sends **plain question and answer text only**. Tool calls, tool results and system messages from the client are rejected (400), so nobody can feed the model forged "data".
2. On the server, the chosen provider gets six **read-only** tools: family members, shared locations, SOS alerts, safe zones, recent activity, and your own sharing status. Every tool:
   - runs as the **session user**, takes **no arguments** from the model, and calls the same authorized functions as the app's pages,
   - returns only what that user may see: consented live locations (no one else's history), with no emails, phone numbers or internal IDs.
   The integration tests check this directly.
3. The loop runs at most 6 rounds. Provider errors become safe messages:
   - "isn't set up correctly" for an invalid key (401/403, or Gemini's 400),
   - "busy" for 429,
   - "unavailable" for anything else.

   Raw provider messages and keys are never passed to the client. Requests time out after 45 s, with one retry.

### Safety and cost

- **Prompt injection:** the tools can't change anything, so instructions hidden in a member's name or SOS message can't trigger actions. The system prompt also tells the model to treat tool data as data.
- **Output** is rendered as plain text, so no HTML or links can be injected.
- **Rate limits:** 10 questions per minute and 200 per day per user (in memory, per server instance).
- **Privacy:** conversations aren't stored. The UI tells users which provider receives their family data. Quick answers never leave the server.

### Tested without real keys

The E2E build sets **fake** keys. The real SDKs then call the real APIs and get rejected: Anthropic with 401 and Gemini with 400. This proves the wiring and the safe error handling at no cost. A scan of the built browser bundle confirms no key, and no key variable name, ever reaches the client.

## Data model

| Collection | Contents |
|---|---|
| `users/{uid}` | Profile. Admin rights come from a Firebase custom claim, never from a profile field. |
| `families/{familyId}` | Group, with a `memberIds` array used for rule checks. |
| `familyInvitations/{id}` | pending, accepted, rejected, revoked or expired. |
| `devices/{id}` | Devices registered by their owner only. |
| `locations/{uid}` | Latest location. It exists only while sharing and is deleted when the user stops. |
| `locationHistory/{uid}/points/{id}` | Optional, owner-controlled retention. |
| `emergencyAlerts/{id}` | SOS events, created only by a user action. |
| `geofences/{id}` | Family safe zones. |
| `notifications/{uid}/items/{id}` | Per-user inbox. |
| `securityEvents/{id}` | Pseudonymous security log (hashed uid, truncated IP). Server-only; expires after 90 days. |
| `_rateLimits/{id}` | Global rate-limit counters with hashed keys. Server-only; expires after the window. |

Full field definitions are in `src/types/models.ts`.

## Project structure

```
src/
  app/
    page.tsx              Landing page
    (auth)/               Login and register (Phase 2)
    (app)/                Authenticated app shell: dashboard, map, family, sos, …
    admin/                Admin console, gated by custom claim (Phase 9)
    manifest.ts           PWA manifest
  components/
    brand/                Logo
    ui/                   Button, Card, Badge, Input, Avatar, Notice, …
    layout/               Sidebar, Topbar, MobileNav, SharingIndicator
    dashboard/            StatCard, ActivityChart, MapPreview
    marketing/            Landing page pieces
  lib/
    env.ts                Typed env access and config detection
    firebase/client.ts    Browser SDK, lazy and null-safe when unconfigured
    firebase/admin.ts     Admin SDK, server-only
  types/models.ts         Firestore data model
tests/                    Vitest suites
firestore.rules           Security rules (deny-all baseline)
```

## Security

The threat model and the full list of controls are in [SECURITY.md](SECURITY.md). In summary:

- **Server-side authority.** Clients can't write to Firestore at all (`firestore.rules`). Every change goes through an API route wrapped in `authed()`, which verifies the session cookie (including revocation), checks same-origin for mutations, requires a verified email and rate-limits. An automated sweep (`tests/security/route-auth.test.ts`) fails the build if a route skips it.
- **Headers.** A Content-Security-Policy (`src/lib/security/csp.ts`) with `frame-ancestors 'none'`, `object-src 'none'`, `base-uri 'self'` and `form-action 'self'`; HSTS, `nosniff`, `X-Frame-Options: DENY`, and `Permissions-Policy: geolocation=(self), camera=(), microphone=()`.
- **Global rate limits.** Sign-in (60/min per IP, 10/min per account), SOS, invitations (30/hour) and the AI assistant (10/min, 200/day) are limited across all server instances through Firestore counters (`_rateLimits`), with an in-memory first line. If Firestore is unreachable the limiter fails open to the in-memory limit.
- **Security log.** Rejected sessions, CSRF blocks, rate-limit hits, admin access and denials, sign-out-everywhere, account and location-data deletion are written to `securityEvents` with a salted hash of the user id (`SECURITY_LOG_SALT`) and a truncated IP (/24 or /48). Nothing else.
- **Secrets.** `firebase/admin.ts` and the AI providers import `server-only`. `tests/security/secrets.test.ts` scans the tree for keys and checks that no server secret is `NEXT_PUBLIC_` or read in a client component. Never commit `.env.local` or service-account files; rotate any key that has been exposed.
- Web geolocation only works while the page is open in the foreground. Reliable background sharing needs the native Android app.

### TTL policies (set these once per project)

Firestore deletes expired documents only when a TTL policy exists for the field. In the Google Cloud console → Firestore → Time-to-live, add:

| Collection group | Field |
|---|---|
| `points` (location history) | `expireAt` |
| `securityEvents` | `expireAt` |
| `_rateLimits` | `expireAt` |

Or with gcloud:

```bash
gcloud firestore fields ttls update expireAt --collection-group=securityEvents --enable-ttl
```

```bash
gcloud firestore fields ttls update expireAt --collection-group=_rateLimits --enable-ttl
```

## Your data and account deletion

In **Settings → Your data**:

- **Delete location data** stops sharing, deletes your live location and your entire location history. Your account and families are untouched.
- **Delete my account** requires a sign-in within the last 5 minutes (you'll be asked to sign in again otherwise) and typing `DELETE`. It then:
  - stops sharing and deletes all location data;
  - leaves every family. Families you own are handed to the longest-standing guardian (or member), who is notified; families with nobody else are deleted;
  - deletes your SOS alerts, your acknowledgements of others' alerts, your family activity entries, your inbox and your devices;
  - deletes invitations sent to you, revokes pending invitations you sent and removes your name from the rest;
  - unlinks you from safe zones you created (the zones stay with the family);
  - revokes all sessions and deletes the sign-in account.

  Each step is idempotent, so a retry after a failure finishes the job. Notifications that other members already received (for example "Ann sent an SOS") stay in their inboxes: they belong to the recipients. The pseudonymous security log entry of the deletion is kept for 90 days.

## Admin console

`/admin` shows aggregate statistics only: user, family, device and sharing counts, SOS and notification volumes, security events (pseudonymous), and system health (Firestore and Auth latency, which keys are configured). It never shows a location, name, email or family content.

Access requires the Firebase custom claim `admin: true`, which only the server can set:

```bash
node --env-file=.env.local scripts/set-admin.mjs grant someone@example.com
```

The user must sign in again for the claim to take effect. Editing a profile can't grant admin rights (the rules deny all client writes, and the app never reads a profile field for this). Every visit and every denied attempt is recorded in the security log.

## Deployment

### Vercel (recommended)

Requires **Node.js 22** (pinned in `package.json` `engines` and `.nvmrc`). `firebase-admin` depends on `jose`, which is ESM-only; older Node versions fail with `require() of ES Module …/jose…` and every signed-in page returns 500.

1. Push the repository to GitHub and import it in Vercel.
2. In Project → Settings → Environment Variables, add every variable from `.env.example`. Paste `FIREBASE_ADMIN_PRIVATE_KEY` with its `\n` escapes.
3. Deploy. Then add the Vercel domain to Firebase Auth → Authorized domains, and to the Maps API key's referrer restrictions.

### Firebase Hosting

Firebase Hosting supports Next.js through its web frameworks integration:

```bash
firebase experiments:enable webframeworks
```

```bash
firebase init hosting
```

```bash
firebase deploy
```
