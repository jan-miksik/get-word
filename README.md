## Get Word

Multilingual language learning app for configurable language pairs, built with **Next.js** + **Supabase Postgres** (via **Drizzle ORM**). Designed for **Vercel** deployment.

### Tech stack

- **Next.js 16** (React 19)
- **Supabase PostgreSQL**
- **Drizzle ORM** (`drizzle-orm`, `drizzle-kit`)
- **Tailwind v4** (compiled by Next/PostCSS from `app/tailwind.css`)
- **@tanstack/react-virtual** for performant lists

### Local development

```bash
pnpm install
cp .env.example .env.local
pnpm run dev
```

App runs on `http://localhost:3000` with Turbopack. Use `pnpm run dev:fast`
to disable dev source maps during tight UI/state iteration.

### Environment variables

Copy `.env.example` to `.env.local` and fill in the values you need:

```bash
cp .env.example .env.local
```

`.env.example` documents each variable in more detail, including which ones are
required vs optional and how to generate the app secrets.

- **Development / admin operations**: prefer **Supabase “Direct connection”** string.
- **Production (Vercel)**: prefer **Supabase “Connection Pooler”** string (better for serverless).
- `APP_SESSION_SECRET` signs session cookies and OpenRouter OAuth state cookies.
- `APP_ENCRYPTION_SECRET` encrypts stored provider API keys in the database.
- `NEXT_PUBLIC_REOWN_PROJECT_ID` is required for wallet connect and embedded Reown email/social auth.
- `GOOGLE_TRANSLATE_API_KEY` and `GOOGLE_TTS_API_KEY` enable list translation and pronunciation audio generation.
- `ARDRIVE_TURBO_WALLET_JWK` funds and signs ArDrive Turbo uploads for generated audio.
- `ARWEAVE_GATEWAY_URL` and `NEXT_PUBLIC_ARWEAVE_GATEWAY_URL` can override the Arweave playback gateway list.

For details (direct vs pooler, URL-encoding passwords, dump/restore), see `SUPABASE_SETUP.md`.

### OpenRouter OAuth (PKCE)

- Provider endpoints are implemented in Next.js route handlers (`/api/providers/openrouter/...`).
- Sensitive OAuth/key operations are server-side only.
- Stored provider keys are encrypted at rest with `APP_ENCRYPTION_SECRET`.
- OpenRouter callback route:
  - local: `http://localhost:3000/api/providers/openrouter/callback`
  - production: `https://<your-domain>/api/providers/openrouter/callback`
- Register the callback URL in your OpenRouter app settings and set `OPENROUTER_OAUTH_APP_ID`.
- OpenRouter’s OAuth guide shows `POST /api/v1/auth/keys` without an auth header, while the API reference documents Bearer auth for that endpoint. This app supports both and will attach `OPENROUTER_OAUTH_BEARER_TOKEN` or `OPENROUTER_API_KEY` if configured.

#### Local dev flow

1. Copy `.env.example` to `.env.local` and fill in the required values.
2. Run DB migrations (`pnpm run db:migrate`).
3. Start app (`pnpm run dev`).
4. Open `/lists` and use API key settings or translation provider CTA to connect OpenRouter.

#### Security assumptions

- OAuth state + PKCE verifier are stored in signed `httpOnly` cookies with short TTL.
- OAuth start/callback endpoints are rate-limited with DB-backed buckets.
- Raw API keys, auth codes, and PKCE verifier values are never returned to client responses.

### Database (Drizzle + Supabase)

**Wallet linking and auth require all migrations to be applied.** If you see a 500 when linking a wallet, run migrations first:

```bash
pnpm run db:migrate    # apply migrations (uses drizzle.config.ts + .env.local)
# or
pnpm run db:migrate:run # run migrations via script (same DATABASE_URL)
```

Ensure `DATABASE_URL` is set in `.env.local` before running.

```bash
pnpm run db:push       # push schema (fast, no migrations)
pnpm run db:studio     # open Drizzle Studio
```

Optional utilities:

```bash
pnpm run db:backup
pnpm run db:dump-restore
pnpm run db:dump-restore-full
```

Drizzle-generated migrations in `drizzle/migrations/` are the canonical schema migration path. The root `migrations/` directory contains legacy/manual Supabase and RLS SQL and should only be edited for those specific tasks.

### Data model & sync

This app uses **device-based identification**:

- Only **`device_id`** is stored in `localStorage`
- Progress, preferences, memory hooks, and filters are **stored in the remote DB**
- Client state lives in `hooks/useAppState.ts` and syncs via `/api/sync` (debounced)

### Deployment (Vercel)

1. Import the repo into Vercel.
2. Set the same environment variables you use locally.
   - At minimum, set `DATABASE_URL`, `APP_SESSION_SECRET`, `APP_ENCRYPTION_SECRET`, and `GET_WORD_APP_URL`.
   - Add `NEXT_PUBLIC_REOWN_PROJECT_ID`, Google API keys, ArDrive, and OpenRouter vars if you use those features.
3. Deploy.

Notes:
- If you run administrative operations like `pg_dump`/`psql`, you’ll typically need a **Direct connection** URL (pooler connections can break those workflows).
- Don’t commit `.env.local` (it’s ignored).
