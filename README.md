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

`npm run setup:data` removes the old A-101…B-202 demo rows and loads the supplied plots 101–503 with their June 2026 payment figures. The admin dashboard has **Tenant details** and **Update rent** tabs. Click **Edit row** to change values directly in the table. Rent sum, balance, and status recalculate automatically, and paid amounts require a paid date. **Save** writes both the unit and monthly payment to Realtime Database. The public page shows status, amount paid, and paid date while keeping phone numbers, rent charges, and notes private.

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
