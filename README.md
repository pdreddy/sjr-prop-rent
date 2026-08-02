# SJR Rent Tracker

A mobile-friendly Next.js rent tracker with one simple username/password administrator login. All units, tenants, payments, audit history, and the securely hashed administrator password are saved in Cloud Firestore.

## Firebase setup

1. Create a Firebase project and a **Cloud Firestore** database in Native mode. Firebase Authentication is not required.
2. The repository is already configured for the supplied Firebase web project's ID, `koc2-20fb8`. The supplied browser API key, analytics ID, app ID, and messaging ID are intentionally not needed by this server-rendered application and are not secrets used for database administration.
3. Open **Project settings > Service accounts** in that project and generate a private key. The browser configuration alone cannot authorize the protected server routes to write Firestore data.
4. Copy `.env.example` to `.env`, then copy `client_email` and `private_key` from the downloaded service-account JSON into `FIREBASE_CLIENT_EMAIL` and `FIREBASE_PRIVATE_KEY`.
5. Choose `ADMIN_USERNAME`, `ADMIN_PASSWORD`, and a random `SESSION_SECRET` of at least 32 characters.
6. Install and initialize the login and sample data:

```bash
npm install
npm run db:seed
npm run dev
```

Open `/admin/login` and enter the `ADMIN_USERNAME` and `ADMIN_PASSWORD` used during seeding. The seed command stores only an scrypt password hash in Firestore. After seeding, `ADMIN_PASSWORD` is not needed by the running website. Password changes made from the dashboard are saved directly to Firestore.

The application uses the service account only in server-side Next.js route handlers. Deploy the included deny-all client rules with `firebase deploy --only firestore:rules`; service-account requests continue to work while browser clients cannot read private rent data.

### Why the Firebase web snippet is not imported

`initializeApp()` from `firebase/app` configures code that runs in a visitor's browser. Importing `firebase/analytics` would also send analytics from the browser, but it would not grant the Next.js APIs permission to save rent records. This application deliberately keeps tenant, payment, login, and service-account access on the server. It therefore uses the project ID plus a Firebase service account rather than shipping Firebase database code or privileged credentials to every browser.

## Deploy to Netlify

1. Push this repository to GitHub and select **Add new project > Import an existing project** in Netlify.
2. Netlify reads `netlify.toml`, runs `npm run build`, and uses its Next.js runtime.
3. In **Project configuration > Environment variables**, add:
   - `FIREBASE_PROJECT_ID`
   - `FIREBASE_CLIENT_EMAIL`
   - `FIREBASE_PRIVATE_KEY` (use literal `\\n` between private-key lines)
   - `SESSION_SECRET`
   - `BUILDING_NAME` (optional)
4. Deploy the site.
5. From a trusted local computer, run the one-time seed against the same Firebase project:

```bash
npm run db:seed
```

Do not put Firebase service-account values in variables prefixed with `NEXT_PUBLIC_`. They must remain server-only. You may remove `ADMIN_PASSWORD` from Netlify after seeding because login checks the hash stored in Firestore.

## Commands

```bash
npm run lint
npm run typecheck
npm run build
npm run db:seed
npm run admin:set-password -- admin "SomeNewLongPassword123"
npm run import:tenants
```

`import:tenants` loads the bundled building register into Firestore and is safe to rerun. Firestore collections are created automatically as `admins`, `units`, `payments`, and `auditLogs`; payment document IDs combine unit ID and month to prevent duplicate monthly records.
