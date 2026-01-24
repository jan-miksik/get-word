# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

WordLink is a language learning app for Czech and Vietnamese built with Next.js 15 (React 19), using Supabase PostgreSQL with Drizzle ORM. Deploys to Vercel. Device-based identification stored in localStorage; all user data syncs to remote DB only (no localStorage for progress/settings).

## Commands

```bash
pnpm run dev              # Dev server with Tailwind watcher (port 3000)
pnpm run build            # Production build
pnpm lint                 # ESLint (flat config in eslint.config.mjs)
pnpm db:push              # Push schema to database (fast, no migrations)
pnpm db:generate          # Generate migration from schema changes
pnpm db:migrate           # Apply migrations
pnpm db:studio            # Open Drizzle Studio
pnpm db:seed              # Seed words from slova.js
```

## Environment Setup

Requires `.env.local` with `DATABASE_URL` pointing to Supabase PostgreSQL connection string.

For local development with Supabase (requires Docker):
```bash
npx supabase start        # Start local PostgreSQL
npx supabase stop         # Stop local PostgreSQL
npx supabase studio       # Open Supabase Studio (http://localhost:54323)
```

## Architecture

### Data Flow
```
Client (useAppState React state)
  → debouncedSync (1s debounce)
  → /api/sync (GET/POST)
  → lib/db/queries/* (Drizzle)
  → Supabase PostgreSQL
```

Only `device_id` persisted in localStorage; all other state fetched from DB on load.

### Key Files

- **`hooks/useAppState.ts`** - Central state management. Fetches from DB on mount, syncs changes via debounced POST. Hydration timeout (10s) prevents UI blocking if fetch hangs.
- **`app/page.tsx`** - Main app. Renders word card grid, panels, spaced repetition UI.
- **`app/api/sync/route.ts`** - GET fetches user data by deviceId/userId; POST syncs progress, hooks, filters, preferences. Includes retry logic for Postgres statement timeouts.
- **`lib/db/`** - Drizzle ORM layer:
  - `schema.ts` - Table definitions (words, users, user_progress, user_memory_hooks, user_category_filters)
  - `client.ts` - Drizzle connection
  - `queries/` - CRUD for each table
- **`lib/sync.ts`** - Client sync utilities. Maintains in-memory `lastKnownUserId` for recovery.
- **`lib/words.ts`** - Word normalization, `STAGES` array (11 intervals), `isDue()` check.
- **`lib/device-id.ts`** - Device ID management. Falls back to in-memory ID if localStorage unavailable.
- **`slova.js`** - Word data (216 entries with id, cz, en, vi, pronunciations, hints)

### Database Schema

Five tables with foreign key constraints and unique constraints:
- `words` - Vocabulary (id like "w000", category[], translations, pronunciations, hints)
- `users` - Device-based auth (device_id unique); email/wallet_address for future auth
- `user_progress` - Spaced repetition per user+word (unique on userId+wordId)
- `user_memory_hooks` - Custom notes per user+word
- `user_category_filters` - Selected categories per user

### Spaced Repetition

11 stages: New (0) → 1min → 10min → 1hr → 8hr → 1day → 3days → 7days → 14days → 30days → 60days.
- `markKnown()` advances +1 stage
- `markReallyKnown()` advances +2 stages
- `markUnknown()` regresses -1 stage
- Word due when `nextDueAt <= now` (stage 0 always shown in "All" tab, not "Ready")

## Important Notes

- **DB-only storage**: Progress, preferences, memory hooks, and filters stored only in remote DB. Device ID is the only localStorage item.
- **Word IDs**: Format "w000", "w001", etc. Defined in `slova.js`, seeded to DB via `db:seed`.
- **Tailwind v4**: Uses CLI-based build. Output goes to `app/.generated/tailwind.css`.
- **No test framework** configured.
