## WordLink

Language learning app (Czech ↔ Vietnamese) built with **Next.js** + **Supabase Postgres** (via **Drizzle ORM**). Designed for **Vercel** deployment.

### Tech stack

- **Next.js 15** (React 19)
- **Supabase PostgreSQL**
- **Drizzle ORM** (`drizzle-orm`, `drizzle-kit`)
- **Tailwind v4** (CLI build to `app/.generated/tailwind.css`)
- **@tanstack/react-virtual** for performant lists

### Local development

```bash
pnpm install
cp .env.example .env.local
pnpm run dev
```

App runs on `http://localhost:3000`.

### Environment variables

Create `.env.local` with:

```env
DATABASE_URL=postgresql://...
WORDLINK_SESSION_SECRET=...
APP_ENCRYPTION_SECRET=...
WORDLINK_APP_URL=http://localhost:3000
OPENROUTER_OAUTH_APP_ID=...
# optional overrides:
# OPENROUTER_AUTH_URL=https://openrouter.ai/auth
# OPENROUTER_API_BASE_URL=https://openrouter.ai/api/v1
# OPENROUTER_OAUTH_EXCHANGE_URL=https://openrouter.ai/api/v1/auth/keys
```

- **Development / admin operations**: prefer **Supabase “Direct connection”** string.
- **Production (Vercel)**: prefer **Supabase “Connection Pooler”** string (better for serverless).

For details (direct vs pooler, URL-encoding passwords, dump/restore), see `SUPABASE_SETUP.md`.

### OpenRouter OAuth (PKCE)

- Provider endpoints are implemented in Next.js route handlers (`/api/providers/openrouter/...`).
- Sensitive OAuth/key operations are server-side only.
- Stored provider keys are encrypted at rest with `APP_ENCRYPTION_SECRET`.
- OpenRouter callback route:
  - local: `http://localhost:3000/api/providers/openrouter/callback`
  - production: `https://<your-domain>/api/providers/openrouter/callback`
- Register the callback URL in your OpenRouter app settings and set `OPENROUTER_OAUTH_APP_ID`.

#### Local dev flow

1. Set env vars above in `.env.local`.
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
pnpm run db:seed       # seed words
pnpm run db:studio     # open Drizzle Studio
```

Optional utilities:

```bash
pnpm run db:dump-restore
pnpm run db:dump-restore-full
pnpm run db:migrate-to-supabase
```

### Data model & sync

This app uses **device-based identification**:

- Only **`device_id`** is stored in `localStorage`
- Progress, preferences, memory hooks, and filters are **stored in the remote DB**
- Client state lives in `hooks/useAppState.ts` and syncs via `/api/sync` (debounced)

### Deployment (Vercel)

1. Import the repo into Vercel.
2. Set **Environment Variables**:
   - `DATABASE_URL`: Supabase **Connection Pooler** Postgres URL (recommended for Production).
3. Deploy.

Notes:
- If you run administrative operations like `pg_dump`/`psql`, you’ll typically need a **Direct connection** URL (pooler connections can break those workflows).
- Don’t commit `.env.local` (it’s ignored).
