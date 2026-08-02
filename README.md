# SJR Rent Tracker

A mobile-friendly rent tracking application for SJR Building. Anyone with the
link can see which plots have paid rent for a given month (no names, phone
numbers, amounts, or notes). Three admins can log in to manage tenants, rent,
and monthly payment records.

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
- The public API (`/api/public/status`) only ever returns plot numbers and a
  Paid/Unpaid flag — tenant names, phone numbers, rent, payment history and
  notes are only queried and returned from routes that require an active
  admin session.
- Every create/update to a unit, payment, or admin password is written to
  `audit_logs` with the acting admin, before/after values, and a timestamp.
- All inputs are validated with `zod` and all queries go through Prisma
  (parameterized), so there is no hand-built SQL.
- `unit_id + month` has a database-level unique constraint, so a payment
  record can never be duplicated for the same plot/month — edits always
  update the existing row.

## Deployment (Vercel)

1. Push this repository to GitHub and import it in Vercel.
2. Provision a Postgres database (Vercel Postgres, Neon, or Supabase all
   work) and copy its connection string.
3. In the Vercel project's Environment Variables, set:
   - `DATABASE_URL`
   - `SESSION_SECRET` (a fresh long random value — do not reuse the local one)
   - `BUILDING_NAME`
   - `ADMIN1_PASSWORD`, `ADMIN2_PASSWORD`, `ADMIN3_PASSWORD` (only needed for
     the one-time seed step below; safe to remove afterwards)
4. Deploy. The build command (`npm run build`) already runs `prisma generate`.
5. Apply migrations and seed the three admins against the production
   database (run once, from your machine or a Vercel CLI shell):
   ```bash
   DATABASE_URL="<production-connection-string>" npx prisma migrate deploy
   DATABASE_URL="<production-connection-string>" npm run db:seed
   ```
6. Log in at `/admin/login` and change each admin's password immediately
   (see "Changing admin passwords" above), then remove the `ADMIN*_PASSWORD`
   env vars from Vercel since they're no longer needed.

The same steps work on Netlify (or any Node host): set the same environment
variables, run `prisma migrate deploy` + the seed script once against the
production database, then deploy the Next.js app.

## Sample data

`npm run db:seed` creates 5 sample plots (A-101, A-102, A-103 (vacant),
B-201, B-202) so you can exercise search, filters, and the payment editor
without entering data by hand.
