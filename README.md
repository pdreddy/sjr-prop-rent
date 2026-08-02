# SJR Rent Tracker

A mobile-friendly rent tracking application for SJR Building. Anyone with the
link can see, per plot, the tenant name, move-in date, and whether that
month's rent is Paid or Unpaid — phone numbers, rent amounts, payment
history and notes stay admin-only. Three admins can log in to manage
tenants, rent, and monthly payment records.

## Tech stack

- Next.js 16 (App Router) + TypeScript
- Tailwind CSS 4
- PostgreSQL + Prisma 7 (driver adapter: `@prisma/adapter-pg`)
- Signed, HTTP-only session cookies (`jose`, 12-hour expiry)
- `bcryptjs` password hashing, `zod` request validation

## Project layout

```
prisma/schema.prisma          Database schema (admins, units, payments, audit_logs)
prisma/seed.ts                 Seeds the 3 admin accounts + sample plots
scripts/set-admin-password.ts  CLI to (re)set an admin's password
src/app/page.tsx               Public status page
src/app/admin/login/page.tsx   Admin login page
src/app/admin/page.tsx         Admin dashboard (server-protected)
src/app/api/public/status      Public read-only API (no auth)
src/app/api/auth/*             Login / logout / session / change-password
src/app/api/admin/*            Protected admin APIs (units, payments, audit log)
src/lib/*                      Auth, session, validation, audit log helpers
```

## Local development

### 1. Prerequisites

- Node.js 20+
- A PostgreSQL 14+ server (local install, Docker, or a hosted instance)

### 2. Install dependencies

```bash
npm install
```

### 3. Configure environment variables

```bash
cp .env.example .env
```

Edit `.env`:

- `DATABASE_URL` — your Postgres connection string.
- `SESSION_SECRET` — a long random string (`openssl rand -base64 48`). Required
  for signing session cookies; the app refuses to start without one.
- `BUILDING_NAME` — shown on the public page (defaults to "SJR Building").
- `ADMIN1_PASSWORD`, `ADMIN2_PASSWORD`, `ADMIN3_PASSWORD` — initial passwords
  used only when you run the seed script (usernames are fixed: `admin1`,
  `admin2`, `admin3`).

### 4. Create the database schema

```bash
npx prisma migrate dev
```

This applies `prisma/migrations` and generates the Prisma Client into
`src/generated/prisma` (gitignored, regenerated automatically on install/build).

### 5. Seed admins + sample plots

```bash
npm run db:seed
```

Creates the three admin accounts (hashed passwords) and a handful of sample
plots so you can try the app immediately.

### 6. Run the dev server

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
npm run build      # prisma generate + next build (production build)
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
  `audit_logs` with the acting admin, before/after values, and a timestamp.
- All inputs are validated with `zod` and all queries go through Prisma
  (parameterized), so there is no hand-built SQL.
- `unit_id + month` has a database-level unique constraint, so a payment
  record can never be duplicated for the same plot/month — edits always
  update the existing row.

## Deployment (Vercel)

You don't need to install or manage Postgres yourself — a free hosted
database (Neon) takes about 2 minutes to set up, and Vercel deploys the app.

### Step 1 — Get a free Postgres database (Neon)

1. Go to https://neon.tech and sign up (free tier is enough for this app).
2. Create a new project (any name/region is fine).
3. On the project dashboard, copy the **connection string** shown — it looks
   like `postgresql://user:password@ep-xxxx.neon.tech/neondb?sslmode=require`.
   That's your entire `DATABASE_URL` — no further setup needed.

(Vercel Postgres or Supabase work identically if you'd rather use one of
those — just copy their connection string the same way.)

### Step 2 — Deploy the app to Vercel

1. Push this repository to GitHub.
2. Go to https://vercel.com, sign up/log in, click **Add New → Project**,
   and import the GitHub repo.
3. Before clicking Deploy, open **Environment Variables** and add:
   - `DATABASE_URL` — the connection string from Step 1.
   - `SESSION_SECRET` — a long random string. Generate one with
     `openssl rand -base64 48` (or any password generator, 40+ characters).
   - `BUILDING_NAME` — e.g. `SJR Building`.
   - `ADMIN1_PASSWORD`, `ADMIN2_PASSWORD`, `ADMIN3_PASSWORD` — temporary
     initial passwords, only needed for the one-time seed step below.
4. Click **Deploy**. Vercel runs `npm run build`, which already runs
   `prisma generate` for you.

### Step 3 — Create the tables and the 3 admin accounts (one-time)

Run this once from your own computer, pointed at the Neon database (paste
the same `DATABASE_URL` you used in Vercel):

```bash
DATABASE_URL="<paste your Neon connection string>" npx prisma migrate deploy
DATABASE_URL="<paste your Neon connection string>" npm run db:seed
```

This creates the `admins`, `units`, `payments`, and `audit_logs` tables and
the three admin accounts (admin1/admin2/admin3) with the passwords you set
in Step 2.

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
is safe. Run it the same way as the seed script, pointed at whichever
database you want to load:

```bash
DATABASE_URL="<connection string>" npm run import:tenants
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

The same steps work on Netlify: create the Neon database the same way
(Step 1), set the same environment variables in Netlify's site settings,
run the one-time `prisma migrate deploy` + `npm run db:seed` commands from
Step 3 against the same `DATABASE_URL`, then deploy the Next.js app via
Netlify's Next.js runtime (Netlify auto-detects Next.js and runs
`npm run build`).

## Sample data

`npm run db:seed` creates 5 sample plots (A-101, A-102, A-103 (vacant),
B-201, B-202) so you can exercise search, filters, and the payment editor
without entering data by hand.
