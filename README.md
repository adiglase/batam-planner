# Batam Planner

An English-first, responsive planner for discovering owner-curated Batam
Destinations and turning them into a feasible Trip and Itinerary.

## Requirements

- Node.js 24 LTS
- npm 11

## Development

Install dependencies and start the development server:

```bash
npm install
npm run dev
```

The application is available at <http://localhost:5173>. On first startup it
creates `.data/batam-planner.sqlite`, applies the initial schema, and adds the
first Published Destination when that seed record is absent.

UI primitives are source-owned shadcn components using Base UI and the Nova
preset. Add another component from the project root with:

```bash
npx shadcn@latest add <component>
```

Set `DATABASE_PATH` to use a different SQLite file:

```bash
DATABASE_PATH=/absolute/path/to/batam-planner.sqlite npm run dev
```

Set a browser-restricted Google Maps JavaScript API key to use the production
map adapter. Without one, development uses the provider-independent illustrated
map fallback:

```bash
VITE_GOOGLE_MAPS_API_KEY=your-browser-key npm run dev
```

Set a separate server-only key with the Google Routes API enabled to show
traffic-unaware distance and duration from a Trip's Accommodation. Keep this
key out of `VITE_*` variables and restrict it to the Routes API:

```bash
GOOGLE_ROUTES_API_KEY=your-server-key npm run dev
```

Without this key, Travel estimates explicitly report that calculation is
unavailable.

## Private owner sign-in

Open `/owner/login` directly (locally: <http://localhost:5173/owner/login>).
There is intentionally no login link in the Visitor workspace. Only Google
sign-in is enabled, and only the configured owner can register or access
Destination publishing. Public Visitor registration remains future work.

1. Copy `.env.example` to `.env`.
2. In Google Cloud Console, configure the Google Auth consent screen and create
   an OAuth client of type **Web application**. If your app is in testing and
   Google requires test users, add your owner account.
3. Register the exact authorized redirect URI:
   `http://localhost:5173/api/auth/callback/google` for local development, and
   `https://YOUR-DOMAIN/api/auth/callback/google` for production.
4. Put the Client ID and Client secret into `GOOGLE_CLIENT_ID` and
   `GOOGLE_CLIENT_SECRET`. Set `BETTER_AUTH_URL` to the app origin (no path),
   and `OWNER_BOOTSTRAP_EMAIL` to the email of your intended Google account.
5. Generate a session secret with `openssl rand -base64 32` and store it in
   `BETTER_AUTH_SECRET`. Never commit `.env` or share tokens and secrets.
6. Run the explicit authentication migration, then start the app:

   ```bash
   npm run auth:migrate
   npm run dev
   ```

7. Visit `/owner/login` and click **Continue with Google**. Choose the configured
   account. Successful sign-in opens `/owner/destinations`.

`dev`, `start`, and `auth:migrate` load `.env` through Node's built-in environment
file support; existing host environment variables take precedence. A missing
`.env` is allowed. Production must set an HTTPS `BETTER_AUTH_URL` and register
its matching callback in Google. The former `/owner/callback` and `OWNER_OIDC_*`
settings are obsolete. Google setup reference:
<https://better-auth.com/docs/authentication/google>.

Better Auth stores accounts and eight-hour sessions in SQLite using its built-in
Kysely adapter. The first verified Google login matching the configured email
binds owner access to Google's stable subject identifier in `owner_identity`.
Changing `OWNER_BOOTSTRAP_EMAIL` afterward **does not transfer ownership**.
There is no public owner-reset endpoint or automatic replacement. Changing owners
requires deliberate offline database maintenance with a backup and revocation of
existing sessions; keep the binding until a separately reviewed transfer is needed.

The migration command adds authentication tables without deleting Destinations or
resetting the owner binding, and is safe to repeat. Run it against the intended
`DATABASE_PATH` before first login and after authentication schema changes;
normal page requests never run authentication migrations. Keep the database on
durable storage and back it up before applying production migrations.

If login says it is not configured, check the five required settings and run
`npm run auth:migrate`. Then restart the server and retry. The public planner
continues to work without Google login configuration. Old owner cookies do not
carry over: sign in again after upgrading.

## Verification

```bash
npm test
npm run typecheck
npm run build
```

Browser-level automation is deliberately deferred for the initial walking
skeleton. This slice was checked manually at 390 × 844 and 1440 × 900. The full
MVP responsive targets remain 360px phone and 1280px desktop widths.

## Production

Build and run the single Node.js application:

```bash
npm run build
npm start
```

The production host must provide durable storage for the SQLite file.
