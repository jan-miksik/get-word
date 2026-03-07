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
```

- **Development / admin operations**: prefer **Supabase “Direct connection”** string.
- **Production (Vercel)**: prefer **Supabase “Connection Pooler”** string (better for serverless).

For details (direct vs pooler, URL-encoding passwords, dump/restore), see `SUPABASE_SETUP.md`.

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
