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
   - `FIREBASE_DATABASE_URL` (`https://koc2-20fb8-default-rtdb.firebaseio.com`)
   - `FIREBASE_SERVICE_ACCOUNT_JSON` containing the complete service-account
     JSON. Raw JSON and base64-encoded JSON are both accepted. This is the
     recommended serverless configuration because a local service-account file
     is not available in Netlify Functions.
   - `SESSION_SECRET`
   - `ADMIN_USERNAME` and `ADMIN_PASSWORD` for the initial login. Remove
     `ADMIN_PASSWORD` after the administrator has been created in Firebase.
   - `BUILDING_NAME` (optional)
   Alternatively, replace `FIREBASE_SERVICE_ACCOUNT_JSON` with
   `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, and `FIREBASE_PRIVATE_KEY`
   (use literal `\\n` between private-key lines).
4. Deploy the site.
   Environment-variable changes do not affect an already-running function;
   trigger a new deploy after adding or editing them.
5. From a trusted local computer, run the one-time seed against the same Firebase project:

```bash
npm run db:seed
```

Do not put Firebase service-account values in variables prefixed with `NEXT_PUBLIC_`. They must remain server-only. You may remove `ADMIN_PASSWORD` from Netlify after seeding because login checks the hash stored in Realtime Database.

### Troubleshoot a deployed login

Open `https://YOUR-SITE.netlify.app/api/health` after every deployment. A healthy
deployment returns `{"status":"ok"}`. An unhealthy response lists missing
configuration without returning secret values. If it reports a Firebase
connection failure, open the Netlify function log for the `/api/health` request;
the server records the underlying Firebase error there.

For a new database, keep `ADMIN_USERNAME` and `ADMIN_PASSWORD` configured until
the first successful login creates the administrator record. If an administrator
already exists, the password stored in Firebase is authoritative; changing only
the Netlify `ADMIN_PASSWORD` value does not reset it. Use
`npm run admin:set-password` from a trusted computer to reset an existing admin.

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
