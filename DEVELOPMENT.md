# Get Word Development

Development and operations notes for the Get Word app. The product overview
lives in [README.md](README.md).

## Local Development

```bash
pnpm install
cp .env.example .env.local
pnpm run dev
```

App runs on `http://localhost:3000` with Turbopack. Use `pnpm run dev:fast`
to disable dev source maps during tight UI/state iteration.

## Environment Variables

Copy `.env.example` to `.env.local` and fill in the values you need:

```bash
cp .env.example .env.local
```

`.env.example` documents each variable in more detail, including which ones are
required vs optional and how to generate the app secrets.

- **Development / admin operations**: use Supabase **Direct connection** when IPv6 is available; otherwise use **Session Pooler** for Drizzle/`psql`.
- **Production (Vercel)**: prefer Supabase **Transaction Pooler** for serverless app traffic.
- `APP_SESSION_SECRET` signs session cookies and OpenRouter OAuth state cookies.
- `APP_ENCRYPTION_SECRET` encrypts stored provider API keys in the database.
- `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` enable Supabase-backed login (email one-time code + Google OAuth); without them the login page is disabled.
- `GOOGLE_TRANSLATE_API_KEY` and `GOOGLE_TTS_API_KEY` enable list translation and pronunciation audio generation.
- `ARDRIVE_TURBO_WALLET_JWK` funds and signs ArDrive Turbo uploads for generated audio.
- `ARWEAVE_GATEWAY_URL` and `NEXT_PUBLIC_ARWEAVE_GATEWAY_URL` can override the Arweave playback gateway list.

For details about direct vs pooler URLs, URL-encoding passwords, and
dump/restore, see [SUPABASE_SETUP.md](SUPABASE_SETUP.md).

## Supabase Auth Setup

Login uses Supabase Auth as a one-shot identity verifier (email one-time code +
Google OAuth); the app then mints its own `get_word_session` cookie. In the
Supabase dashboard:

- **Authentication → Providers**: enable **Email** and **Google**.
- **Authentication → URL Configuration → Redirect URLs**: add
  `http://localhost:3000/api/auth/callback` and your production equivalent.
- **Authentication → Sign In / Providers → User Signups**: turn **Confirm email**
  **off**. The email login is OTP-based, and completing the code already proves
  inbox ownership, so the separate confirmation step is redundant. With it off,
  first-time logins use the **Magic Link** template (not **Confirm signup**), so
  there is only one template to maintain.
- **Authentication → Emails → Templates → Magic Link**: the default template
  emails a *link* (`{{ .ConfirmationURL }}`), but the app UI asks for a *code*.
  Replace the body so it prints the token instead:

  ```html
  <h2>Your Get Word sign-in code</h2>
  <p>Enter this code to finish signing in:</p>
  <p style="font-size:24px;letter-spacing:4px;"><strong>{{ .Token }}</strong></p>
  ```

  If you leave **Confirm email** on instead, apply the same change to the
  **Confirm signup** template as well.

The OTP length is whatever Supabase is configured to send (default is 8 digits).
The app's `verifyOtp` accepts any length, so tuning it needs no app change.

## OpenRouter OAuth (PKCE)

- Provider endpoints are implemented in Next.js route handlers (`/api/providers/openrouter/...`).
- Sensitive OAuth/key operations are server-side only.
- Stored provider keys are encrypted at rest with `APP_ENCRYPTION_SECRET`.
- OpenRouter callback route:
  - local: `http://localhost:3000/api/providers/openrouter/callback`
  - production: `https://<your-domain>/api/providers/openrouter/callback`
- Register the callback URL in your OpenRouter app settings and set `OPENROUTER_OAUTH_APP_ID`.
- OpenRouter's OAuth guide shows `POST /api/v1/auth/keys` without an auth header, while the API reference documents Bearer auth for that endpoint. This app supports both and will attach `OPENROUTER_OAUTH_BEARER_TOKEN` or `OPENROUTER_API_KEY` if configured.

### Local OpenRouter Flow

1. Copy `.env.example` to `.env.local` and fill in the required values.
2. Run DB migrations (`pnpm run db:migrate`).
3. Start app (`pnpm run dev`).
4. Open `/lists` and use API key settings or translation provider CTA to connect OpenRouter.

### Security Assumptions

- OAuth state + PKCE verifier are stored in signed `httpOnly` cookies with short TTL.
- OAuth start/callback endpoints are rate-limited with DB-backed buckets.
- Raw API keys, auth codes, and PKCE verifier values are never returned to client responses.

## Database (Drizzle + Supabase)

**Auth requires all migrations to be applied.** If you see a 500 during login
(the callback attaches the Supabase identity to a `users` row), run migrations
first:

```bash
pnpm run db:migrate     # apply migrations (uses drizzle.config.ts + .env.local)
# or
pnpm run db:migrate:run # run migrations via script (same DATABASE_URL)
```

Ensure `DATABASE_URL` is set in `.env.local` before running.

```bash
pnpm run db:push       # push schema (fast, no migrations)
pnpm run db:studio     # open Drizzle Studio
```

For production, prompt for the URL instead of storing it in `.env.local` or
putting it into shell history:

```bash
pnpm run db:dev:backup
pnpm run db:prod:migrate
pnpm run db:prod -- restore backups/dev_public_data_YYYYMMDD_HHMMSS.sql
pnpm run db:prod -- sql path/to/reviewed-operation.sql
pnpm run db:prod -- compact          # dry run
pnpm run db:prod -- compact --apply
pnpm run db:prod -- shell            # emergency interactive access only
```

`db:dev:backup` reads the current development `DATABASE_URL` from `.env.local`
unless `DEV_DATABASE_URL` is provided, then writes an ignored
`backups/dev_public_data_*.sql` export of application data in the `public`
schema. For a new production database, apply migrations first, then restore
that data backup. It does not copy Supabase Auth or Storage-managed schemas.
Treat the dump as sensitive user data; it includes encrypted provider-key
records, which require the same `APP_ENCRYPTION_SECRET` to decrypt after import.

The production helper hides the pasted production `DATABASE_URL`, exposes it
only to the selected allowlisted action, shows the target host for
confirmation, rejects local database URLs, and unsets the URL when done.
Applying migrations, restoring data, executing SQL, opening an interactive
shell, and deleting maintenance rows each require a purpose-specific
confirmation phrase. Supabase Direct URLs
(`db.<project-ref>.supabase.co:5432`) require IPv6 by default. If the machine
running the command cannot resolve or reach that host, paste the Session Pooler
URL from the Supabase Connect panel instead (`*.pooler.supabase.com:5432`).

Optional utilities:

```bash
pnpm run db:dump-restore
pnpm run db:dump-restore-full
```

Drizzle-generated migrations in `drizzle/migrations/` are the canonical and
only current checked-in schema migration path. Historical manual Supabase/RLS
SQL that used to live in a root `migrations/` directory can be recovered from
Git history if it is needed for investigation.

## Data Model And Sync

This app uses **device-based identification**:

- Only **`device_id`** is stored in `localStorage`.
- Progress, preferences, memory hooks, and filters are **stored in the remote DB**.
- Client state lives in `hooks/useAppState.ts` and syncs via `/api/sync` (debounced).

## Deployment (Vercel)

1. Import the repo into Vercel.
2. Set the same environment variables you use locally.
   - At minimum, set `DATABASE_URL`, `APP_SESSION_SECRET`, `APP_ENCRYPTION_SECRET`, `GET_WORD_APP_URL`, `NEXT_PUBLIC_SUPABASE_URL`, and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.
   - Add `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` to enable login, plus Google API keys, ArDrive, and OpenRouter vars if you use those features.
3. Deploy.

Notes:

- For Drizzle migrations and `psql`, use a **Direct connection** URL when your network supports IPv6, or Supabase **Session Pooler** on port `5432` when it does not. Prefer direct/IPv4-enabled connectivity for dump and restore operations.
- Do not commit `.env.local`; it is ignored.
