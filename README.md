## Get Word

Language learning app (Czech ↔ Vietnamese) built with **Next.js** + **Supabase Postgres** (via **Drizzle ORM**). Designed for **Vercel** deployment.

### Tech stack

- **Next.js 15** (React 19)
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

Create `.env.local` with:

```env
DATABASE_URL=postgresql://...
# Used to sign login/session cookies and OAuth state cookies.
# Generate with: openssl rand -base64 32
APP_SESSION_SECRET=...
# Used to encrypt stored BYOK provider API keys at rest.
# Generate with: openssl rand -hex 32
APP_ENCRYPTION_SECRET=...
WORDLINK_APP_URL=http://localhost:3000
GOOGLE_TRANSLATE_API_KEY=...
GOOGLE_TTS_API_KEY=...
# Optional Google free-tier monitoring/limits. Defaults use a 5% per-account monthly share.
# GOOGLE_TRANSLATE_FREE_MONTHLY_CHARS=500000
# GOOGLE_TTS_FREE_MONTHLY_CHARS=1000000
# GOOGLE_API_FREE_ACCOUNT_LIMIT_RATIO=0.05
# GOOGLE_TRANSLATE_ACCOUNT_MONTHLY_CHARS=25000
# GOOGLE_TTS_ACCOUNT_MONTHLY_CHARS=50000
# Single-line Arweave JWK JSON or base64-encoded JWK JSON for ArDrive Turbo uploads
ARDRIVE_TURBO_WALLET_JWK=...

# Optional overrides
# ARDRIVE_TURBO_UPLOAD_URL=https://upload.ardrive.io
# ARDRIVE_TURBO_PAYMENT_URL=https://payment.ardrive.io
# ARWEAVE_GATEWAY_URL=https://arweave.net

# Optional app identifier sent to OpenRouter during OAuth.
OPENROUTER_OAUTH_APP_ID=...

# optional, for bearer-auth exchange compatibility:
# OPENROUTER_OAUTH_BEARER_TOKEN=...
# OPENROUTER_API_KEY=...

# optional overrides:
# OPENROUTER_AUTH_URL=https://openrouter.ai/auth
# OPENROUTER_API_BASE_URL=https://openrouter.ai/api/v1
# OPENROUTER_OAUTH_EXCHANGE_URL=https://openrouter.ai/api/v1/auth/keys

# Optional Reown embedded email/social auth.
# Disabled by default to avoid loading third-party embedded-wallet telemetry scripts in local dev.
# Plain wallet connection still works without this.
# NEXT_PUBLIC_REOWN_EMBEDDED_WALLET_AUTH=true
# NEXT_PUBLIC_REOWN_AUTO_RECONNECT=true
# NEXT_PUBLIC_REOWN_THIRD_PARTY_WALLETS=true
```

- **Development / admin operations**: prefer **Supabase “Direct connection”** string.
- **Production (Vercel)**: prefer **Supabase “Connection Pooler”** string (better for serverless).
- `APP_SESSION_SECRET` signs session cookies and OpenRouter OAuth state cookies.
- `APP_ENCRYPTION_SECRET` encrypts stored provider API keys in the database.
- `ARDRIVE_TURBO_WALLET_JWK` funds and signs ArDrive Turbo uploads for generated audio.
- `ARWEAVE_GATEWAY_URL` controls the public gateway used by `/api/audio/[hash]` redirects.
- `NEXT_PUBLIC_REOWN_EMBEDDED_WALLET_AUTH=true` enables Reown email/social embedded wallet sign-in. Leave it unset for wallet-only auth and a quieter dev console.
- `NEXT_PUBLIC_REOWN_AUTO_RECONNECT=true` lets AppKit reconnect wallets during page load. It is unset by default because reconnect can initialize vendor SDK telemetry before the user opens the wallet modal.
- `NEXT_PUBLIC_REOWN_THIRD_PARTY_WALLETS=true` lets AppKit auto-add optional third-party connectors such as Coinbase/Base Account. It is unset by default to avoid Coinbase analytics requests in blocked local browsers.

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
