# SJR Rent Tracker

A mobile-friendly Next.js rent tracker with one simple username/password administrator login. All units, tenants, payments, audit history, and the securely hashed administrator password are saved in Firebase Realtime Database.

## Firebase setup

1. In the Firebase project, open **Build > Realtime Database**, click **Create Database**, select a location, and start in locked mode. Firebase Authentication is not required.
2. The repository includes the supplied Firebase web configuration for project `koc2-20fb8`. Firebase App and Analytics load in the browser after the page becomes interactive.
3. Open **Project settings > Service accounts** in that project and generate a private key. The browser configuration alone cannot authorize the protected server routes to write Realtime Database data.
4. Rename the downloaded file to `firebase-service-account.json` and put it in the repository root. It is gitignored. Copy `.env.example` to `.env`; no private-key editing is needed locally.
5. Choose `ADMIN_USERNAME`, `ADMIN_PASSWORD`, and a random `SESSION_SECRET` of at least 32 characters.
6. Install and initialize the login, then import the supplied tenant register:

```bash
npm install
npm run setup:data
npm run dev
```

`npm run setup:data` removes the old A-101…B-202 demo rows and loads the supplied plots 101–503 with their June 2026 payment figures. The admin dashboard has **Tenant details** and **Update rent** tabs. Click **Edit row** to change values directly in the table. Rent sum, balance, and status recalculate automatically, and paid amounts require a paid date. **Save** writes both the unit and monthly payment to Realtime Database. The public page shows electricity charges, payments and balances, with rent shown only as payment status. Rent amounts, phone numbers and admin notes stay private.

If an IDE reports that it cannot resolve `next/package.json` or
`default-transpiled-packages.json`, run the commands from the repository root
(the folder containing `package.json`). Then reset the local installation:

```bash
rm -rf .next node_modules
npm ci
npm run dev
```

The project pins Turbopack's root in `next.config.ts`, so IDE launchers cannot
incorrectly treat `src/app` as the workspace root.

Copy/paste local setup after downloading the JSON:

```bash
mv ~/Downloads/YOUR-DOWNLOADED-FIREBASE-FILE.json ./firebase-service-account.json
cp .env.example .env
npm install
npm run db:seed
npm run dev
```

Open `/admin/login` and enter `ADMIN_USERNAME` and `ADMIN_PASSWORD`. On the first successful login, the server automatically creates the administrator node with an scrypt password hash, so seeding is optional for login. `npm run db:seed` is still useful for loading sample plots. Password changes made from the dashboard are saved directly to Realtime Database.

Browser-console messages from `contentScript.bundle.js` or `api2.amplitude.com` come from a browser extension (often an ad/privacy blocker integration), not this application. They can be ignored or confirmed by testing in a private window with extensions disabled.

Likewise, hydration differences containing injected attributes such as `jd-enabled` or `data-sharkid`, or a stack trace beginning with `chrome-extension://`, are caused by password-manager/security extensions changing the page before React starts. The root suppresses harmless extension attributes, and the login form mounts after hydration so extensions cannot mutate its server-rendered inputs. Disable the extension for localhost if it continues trying to replace `window.location`.

The application uses the service account only in server-side Next.js route handlers. Deploy the included deny-all client rules with `firebase deploy --only database`; service-account requests continue to work while browser clients cannot read private rent data.

### Firebase browser and server configuration

The supplied `initializeApp()` and Analytics configuration is now loaded globally in the browser from Google's official Firebase module CDN. It provides browser analytics only. Tenant, payment, and login data still use protected server routes and the service account because the public web API key cannot authorize privileged Realtime Database writes.

Like the reference KOC app, every public Firebase setting has a built-in fallback and can optionally be overridden in Netlify with `NEXT_PUBLIC_FIREBASE_API_KEY`, `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`, `NEXT_PUBLIC_FIREBASE_DATABASE_URL`, `NEXT_PUBLIC_FIREBASE_PROJECT_ID`, `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET`, `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID`, `NEXT_PUBLIC_FIREBASE_APP_ID`, and `NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID`. The included `koc2-20fb8` defaults mean none of these public variables are required for local testing.

## Deploy to Netlify

1. Push this repository to GitHub and select **Add new project > Import an existing project** in Netlify.
2. Netlify reads `netlify.toml`, runs `npm run build`, and uses its Next.js runtime.
3. In **Project configuration > Environment variables**, add:
   - `FIREBASE_PROJECT_ID` (`koc2-20fb8`)
   - `FIREBASE_DATABASE_URL` (`https://koc2-20fb8-default-rtdb.firebaseio.com`)
   - `FIREBASE_CLIENT_EMAIL`
   - `FIREBASE_PRIVATE_KEY` (use literal `\\n` between private-key lines)
   - `SESSION_SECRET`
   - `BUILDING_NAME` (optional)
4. Deploy the site.
5. From a trusted local computer, run the one-time seed against the same Firebase project:

```bash
npm run db:seed
```

Do not put Firebase service-account values in variables prefixed with `NEXT_PUBLIC_`. They must remain server-only. You may remove `ADMIN_PASSWORD` from Netlify after seeding because login checks the hash stored in Realtime Database.

## Commands

```bash
npm run lint
npm run typecheck
npm run build
npm run db:seed
npm run admin:set-password -- admin "SomeNewLongPassword123"
npm run import:tenants
```

`import:tenants` loads the bundled building register into Realtime Database and is safe to rerun. Top-level nodes are created automatically as `admins`, `units`, `payments`, and `auditLogs`; payment keys combine unit ID and month to prevent duplicate monthly records.

## Admin settings

**Admin → Settings** configures:

- **Electricity**: rate per unit, the fixed bill used while no meter units are recorded (a "high" amount for chosen plots, a standard amount for the rest, and optional per-plot amounts such as `305=650`), and the over-payment limit below which extra rent money counts as electricity.
- **Building & public page**: building name and an optional notice shown on the public status page.

Once a month has a current meter reading, the bill is (current − previous) × rate; until then the fixed bill applies. Settings are stored in Realtime Database under `settings/electricity` and `settings/general`; existing rates carry over and missing values fall back to the previous defaults (₹7/unit, ₹750/₹500, ₹1,500). The public home page lists every plot's rent and electricity status; tenant names are shown by default and can be switched off in Settings (names are then stripped on the server). `PUBLIC_SHOW_TENANT_NAME` is no longer used.

## Install as an app (PWA)

The site is an installable Progressive Web App: Chrome/Edge/Android show **Install app**, and on iPhone/iPad use Safari **Share → Add to Home Screen**. It ships a manifest (`src/app/manifest.ts`), icons (`public/icons/`), and a service worker (`src/app/sw.js/route.ts`, registered only in production builds). The service worker caches only public static files and shows `public/offline.html` when the network is down; it never caches `/api/*` or any page, so rent data and admin screens are not stored on the device. Browser support follows Tailwind CSS 4: Chrome/Edge 111+, Safari 16.4+, Firefox 128+.

If you cannot sign in, run `npm run auth:check` (or `npm run auth:check -- <username> <password>`): it checks `SESSION_SECRET`, the Firebase connection, and the stored admin accounts, and tells you how to reset a password. In development the login form now also shows the underlying server error. Also, if sign-in appears to do nothing: the session cookie is now marked `Secure` only when the request is HTTPS (previously any production build on plain `http://`, such as `next start` on a LAN IP, silently dropped it). When running `npm run dev` from another device, list its address in `DEV_ORIGINS` (see `next.config.ts`).

## Run it locally

```bash
npm run local
```

Runs the app against your **real Firebase** database using `.env`. It checks `SESSION_SECRET` and the Firebase connection first, tells you whether you are on live data or a test copy (`FIREBASE_DB_PREFIX`), and then starts the dev server at http://localhost:3000 (admin at `/admin/login`, using your existing admin login; no password change needed). It never uses the local mock database.

No Firebase handy? `npm run demo` starts the app with an in-memory demo database and sample plots (sign in with `admin` / `admin123`).

## Checking that data loads

`npm run db:mock` starts an in-memory stand-in for Realtime Database, so the whole app can be tested without credentials. With the mock running and the app started against it (`FIREBASE_DATABASE_EMULATOR_HOST=127.0.0.1:9000`), `npm run smoke` seeds plots, signs in as the admin, loads every public and admin endpoint and asserts the numbers (rent, electricity units and fixed bills, N/A rules, settings round-trip, no private data on the public page). See the comments at the top of `scripts/smoke.ts` for the exact commands. API routes are wrapped so a database failure returns a JSON error instead of a broken response, and the server logs a clear message at startup when settings are missing.


## Compact public UI branch

`codex/public-ui-on-working-firebase` starts from `claude/merge-codex-pwa`.
The Firebase implementation, API routes, authentication, settings, data model,
admin screens, `.env.example`, and existing startup/demo/smoke scripts are
unchanged. Use the same local configuration and commands as that branch.
This UI update does not require reseeding, an emulator, or new credentials.

The public page retains rent and electricity filters, needs-attention filtering,
collection counts, paid dates, meter readings and electricity history totals in a
compact table. Existing PWA installation, shortcuts, offline behavior and
service-worker registration are retained.

Browser validation:

```bash
npx playwright install chromium
npm run build
npm run test:e2e
```

For an existing system Chromium, set
`PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium`. Browser tests mock API
responses; the repository's separate `npm run smoke` command exercises the
server and data layer using its isolated mock database. Never run smoke tests
against the live database.


### Live public updates and app installation

The public view refreshes every minute while visible and online, and refreshes
when you return to the tab or reconnect. Background refresh keeps the existing
list and filters in place. Offline or failed refreshes clearly label any
previously loaded records; payment data stays in memory and is not saved for
offline use. A fresh offline launch still shows the informational offline page.
All reads use the existing public API and Firebase configuration.

Summary cards act as quick filters; Total plots clears the search and filters.
Install instructions use a keyboard-accessible dialog. Supporting browsers show
a native Install app action; Safari users can use Share → Add to Home Screen.
Installation controls hide when the app is already running standalone.

The production service worker checks for updates when the app is revisited or
reconnects. A worker update offers Refresh app rather than reloading an admin
form automatically. Bump its VERSION when changing worker/precache behavior.
Use HTTPS (or localhost) and `npm run build && npm start` to test PWA behavior;
development deliberately removes production workers and their caches.


### Public tenant-name privacy

Admin → Settings → Building & public page → Public tenant names now supports
full names, masked names (first three characters, e.g. Deepika → Dee***), or
hidden names. Masking happens on the server before the public API sends data,
so the list, plot details and public search receive only the masked value.
Admin views retain the original name. Existing settings keep their current
full/hidden behavior until the admin changes it. Name characters are counted
as Unicode graphemes so accented characters and emoji are not split.


### Public payment history

Click anywhere on a plot row (or focus its plot-number button and press Enter)
to expand one electricity history table directly below it. Click again to collapse.
Each month shows rent payment status alongside electricity readings, units,
bills, credits applied, balances and electricity status. Totals are electricity only.
Rent amounts and totals are excluded from the public API, along with contact
details, admin notes and audit fields. Admin payment history retains full details.
Masked/hidden names remain enforced on the server.
