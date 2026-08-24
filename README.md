# SJR Rent Tracker

A mobile-friendly rent tracking application for SJR Building. Anyone with the
link can see, per plot, the tenant name, move-in date, and whether that
month's rent is Paid or Unpaid — phone numbers, rent amounts, payment
history and notes stay admin-only. Three admins can log in to manage
tenants, rent, and monthly payment records.

## Tech stack

- Next.js 16 (App Router) + TypeScript
- Tailwind CSS 4
- Firebase Realtime Database, accessed only through the Firebase Admin SDK
  on the server (the browser never talks to Firebase directly)
- Signed, HTTP-only session cookies (`jose`, 12-hour expiry)
- `bcryptjs` password hashing, `zod` request validation

## Project layout

```
src/lib/firebase.ts            Firebase Admin SDK init (lazy, memoized)
src/lib/db.ts                  All Realtime Database reads/writes
scripts/seed.ts                 Seeds the 3 admin accounts + sample plots
scripts/import-tenants.ts       One-time import of real tenant data
scripts/set-admin-password.ts   CLI to (re)set an admin's password
database.rules.json             Realtime Database security rules (deny all
                                 direct client access — everything goes
                                 through the server's Admin SDK)
src/app/page.tsx                Public status page
src/app/admin/login/page.tsx    Admin login page
src/app/admin/page.tsx          Admin dashboard (server-protected)
src/app/api/public/status       Public read-only API (no auth)
src/app/api/auth/*              Login / logout / session / change-password
src/app/api/admin/*             Protected admin APIs (units, payments, audit log)
src/lib/auth.ts, session.ts     Auth/session logic (unchanged by backend choice)
```

## Data model

Everything lives under a Realtime Database instance, laid out as:

```
/admins/{username}                        passwordHash, active, lockout state
/units/{unitId}                           plot number, tenant, rent, maintenance
/unitsByPlotNumber/{encodedPlotNumber}     unitId — enforces unique plot numbers
/payments/{unitId}/{month}                 one payment record per unit+month
                                           (the nested path itself prevents
                                           duplicate records for the same
                                           plot/month — upserts always land
                                           on the same node)
/auditLogs/{pushId}                        who changed what, when
```

## Local development

### 1. Prerequisites

- Node.js 20+
- A Firebase project with Realtime Database enabled (see below)

### 2. Create a Firebase project + Realtime Database (~2 minutes)

1. Go to https://console.firebase.google.com and create a project (free
   Spark plan is enough for this app).
2. In the left sidebar, go to **Build → Realtime Database → Create Database**.
   Pick any region; start in **locked mode** (this repo's
   `database.rules.json` denies all direct client access anyway, since the
   app only talks to Firebase through the server-side Admin SDK).
3. Copy the database URL shown at the top of that page (looks like
   `https://your-project-id-default-rtdb.firebaseio.com`).
4. Go to **Project settings → Service accounts → Generate new private key**.
   This downloads a JSON file — treat it like a password, never commit it.

### 3. Install dependencies

```bash
npm install
```

### 4. Configure environment variables

```bash
cp .env.example .env
```

Edit `.env`:

- `FIREBASE_DATABASE_URL` — the URL from step 2.3.
- `FIREBASE_SERVICE_ACCOUNT_JSON` — paste the entire contents of the
  downloaded service account JSON file as one line. (Alternative for local
  dev: save the file locally and use `FIREBASE_SERVICE_ACCOUNT_PATH`
  instead — see the comments in `.env.example`.)
- `SESSION_SECRET` — a long random string (`openssl rand -base64 48`).
  Required for signing session cookies; the app refuses to start without one.
- `BUILDING_NAME` — shown on the public page (defaults to "SJR Building").
- `ADMIN1_PASSWORD`, `ADMIN2_PASSWORD`, `ADMIN3_PASSWORD` — initial passwords
  used only when you run the seed script (usernames are fixed: `admin1`,
  `admin2`, `admin3`).

### 5. Deploy the security rules (one-time)

```bash
npx firebase login
npx firebase deploy --only database --project <your-project-id>
```

This pushes `database.rules.json` (deny-all for direct client access, plus
the index the audit log needs) to your Firebase project. You can also just
paste the contents of `database.rules.json` into the Firebase console's
**Realtime Database → Rules** tab and click Publish — same effect.

### 6. Seed admins + sample plots

```bash
npm run db:seed
```

Creates the three admin accounts (hashed passwords) and a handful of sample
plots so you can try the app immediately.

### 7. Run the dev server

```bash
npm run dev
```

- Public view: http://localhost:3000
- Admin login: http://localhost:3000/admin/login (use `admin1` / the password
  you set in `.env`)

## Quality checks

```bash
npm run lint       # ESLint
npm run typecheck  # tsc --noEmit
npm run build      # next build (production build)
```

All three are expected to pass with zero errors.

## Changing admin passwords

**From the dashboard (recommended):** log in, click **Change password** in the
header, enter the current password and a new one (10+ characters).

**From the command line** (e.g. to recover a locked-out or forgotten
password):

```bash
npm run admin:set-password -- admin2 "SomeNewLongPassword123"
```

This hashes the new password with bcrypt, updates the database directly, and
clears any lockout on that account.

## Security notes

- Passwords are hashed with bcrypt (cost factor 12) and never sent to or
  stored in the browser.
- Sessions are signed JWTs (`SESSION_SECRET`) in an `httpOnly`, `sameSite=lax`
  cookie, `secure` in production, expiring after 12 hours.
- Every admin API route re-verifies the session **and** re-checks the admin
  is still active in the database on every request — deactivating an admin
  revokes access immediately, and nothing is trusted from the client.
- Failed logins are tracked per account; 5 consecutive failures lock the
  account for 15 minutes. A lightweight in-memory IP rate limit (10
  attempts / 5 minutes) additionally slows down brute-force attempts against
  the login endpoint itself.
- The public API (`/api/public/status`) only ever returns plot number,
  tenant name, move-in date, and a Paid/Unpaid flag. Phone numbers, rent
  amounts, amount paid, balance, payment dates, and notes are only queried
  and returned from routes that require an active admin session.
- Every create/update to a unit, payment, or admin password is written to
  `auditLogs` with the acting admin, before/after values, and a timestamp.
- All inputs are validated with `zod`.
- **The browser never talks to Firebase directly** — there's no client-side
  Firebase SDK or config in this app. Every read/write goes through this
  app's own Next.js API routes, which use the Admin SDK (full access via
  the service account) server-side. `database.rules.json` denies all direct
  client access (`.read`/`.write`: false) as defense in depth, in case a
  database URL or key ever leaked.
- Payments are stored at `/payments/{unitId}/{month}` — that nested path
  structure itself prevents duplicate records for the same plot/month;
  saving a payment always upserts the one node at that path.

## Deployment (Vercel)

### Step 1 — Firebase project (if you haven't already)

Follow "Local development" steps 2–5 above against your real Firebase
project (create the project, enable Realtime Database, generate a service
account key, deploy the security rules). You'll reuse the same
`FIREBASE_DATABASE_URL` and service account JSON in Vercel.

### Step 2 — Deploy the app to Vercel

1. Push this repository to GitHub.
2. Go to https://vercel.com, sign up/log in, click **Add New → Project**,
   and import the GitHub repo.
3. Before clicking Deploy, open **Environment Variables** and add:
   - `FIREBASE_DATABASE_URL`
   - `FIREBASE_SERVICE_ACCOUNT_JSON` — the full service account JSON,
     pasted as one line (this is the one to use in production, not
     `FIREBASE_SERVICE_ACCOUNT_PATH`, since there's no local file on Vercel).
   - `SESSION_SECRET` — a long random string. Generate one with
     `openssl rand -base64 48` (or any password generator, 40+ characters).
   - `BUILDING_NAME` — e.g. `SJR Building`.
   - `ADMIN1_PASSWORD`, `ADMIN2_PASSWORD`, `ADMIN3_PASSWORD` — temporary
     initial passwords, only needed for the one-time seed step below.
4. Click **Deploy**.

### Step 3 — Create the 3 admin accounts (one-time)

Run this once from your own computer, with `.env` pointed at the same
Firebase project you just configured in Vercel:

```bash
npm run db:seed
```

This creates the three admin accounts (admin1/admin2/admin3) with the
passwords you set in Step 2, plus a few sample plots.

### Step 4 — Log in and lock things down

1. Visit `https://<your-app>.vercel.app/admin/login` and sign in as `admin1`.
2. Change each admin's password immediately (see "Changing admin passwords"
   above) — the ones from `.env`/Vercel were only temporary.
3. In Vercel, remove the `ADMIN1_PASSWORD` / `ADMIN2_PASSWORD` /
   `ADMIN3_PASSWORD` environment variables — they're no longer needed once
   the accounts exist and passwords are changed.

That's it — the public page is live at your Vercel URL with no login
required, and `/admin/login` is the admin entry point.

### Loading real tenant data

`scripts/import-tenants.ts` (`npm run import:tenants`) is a one-time,
re-runnable import of the building's actual plots — name, joining date,
rent, maintenance, phone, and the June 2026 payment status — written from
the original rent register. It upserts by plot number, so running it again
is safe. Run it with `.env` pointed at whichever Firebase project you want
to load:

```bash
npm run import:tenants
```

A few source values were ambiguous and were imported as-is with a flag:
- Plots 201, 402, and 403 had an unclear/uncertain amount paid for June in
  the original sheet (shown as "?"/"??") — these were imported as
  **Unpaid** with a note added ("Amount paid for June unclear in source
  records — needs verification"). Fix them via the admin dashboard once you
  confirm the real amount.
- Plot 402's joining date was recorded as "01-Jun-16" in the source, which
  is almost certainly a typo for 2026 — imported as **1 Jun 2026**. Correct
  it in the admin dashboard if that's wrong.
- Plots 101 and 501 joined in August 2026 with only a total rent figure
  given (no rent/maintenance breakdown yet) — imported with that total as
  the rent and maintenance at ₹0; split it once you know the real numbers.

### Netlify instead of Vercel

The same steps work on Netlify: create the Firebase project the same way
(Step 1), set the same environment variables in Netlify's site settings,
run the one-time `npm run db:seed` (Step 3) with `.env` pointed at that
project, then deploy the Next.js app via Netlify's Next.js runtime
(Netlify auto-detects Next.js and runs `npm run build`).

## Sample data

`npm run db:seed` creates 5 sample plots (A-101, A-102, A-103 (vacant),
B-201, B-202) so you can exercise search, filters, and the payment editor
without entering data by hand.

## Testing locally without a real Firebase project

The Firebase Realtime Database emulator lets you run the whole app without
touching a real project (useful for trying things out or automated testing).
It requires Java.

```bash
npx firebase emulators:start --only database --project demo-sjr-rent-tracker
```

Then in `.env`, point the app at the emulator instead of a real project:

```
FIREBASE_DATABASE_EMULATOR_HOST="127.0.0.1:9000"
FIREBASE_DATABASE_URL="https://demo-sjr-rent-tracker-default-rtdb.firebaseio.com"
FIREBASE_PROJECT_ID="demo-sjr-rent-tracker"
```

No `FIREBASE_SERVICE_ACCOUNT_JSON`/`_PATH` is needed against the emulator —
it doesn't check credentials. Data lives only in the emulator's memory and
is lost when it stops (nothing to clean up).
