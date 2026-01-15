# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

WordLink is a language learning app for Czech and Vietnamese built with Next.js 15 (React 19), using Supabase (PostgreSQL) with Drizzle ORM for cross-device sync. Deploys to Vercel. Uses device-based identification with localStorage for offline persistence.

## Commands

```bash
pnpm run dev              # Dev server with Tailwind watcher (port 3000)
pnpm run build            # Production build
pnpm lint                 # Run Next.js linter
pnpm db:push              # Push schema to database
pnpm db:generate          # Generate migration from schema changes
pnpm db:migrate           # Apply migrations
pnpm db:studio            # Open Drizzle Studio
pnpm db:seed              # Seed words from slova.js
```

## Local Development

Requires Docker for local Supabase:
```bash
npx supabase start        # Start local PostgreSQL
npx supabase stop         # Stop local PostgreSQL
npx supabase studio       # Open Supabase Studio (http://localhost:54323)
```

## Architecture

### Data Flow
```
Client (localStorage + useAppState)
  → debouncedSync (1s debounce)
  → /api/sync
  → lib/db/ (Drizzle queries)
  → Supabase PostgreSQL
```

### Key Files

- **`hooks/useAppState.ts`** - Central state management hub. Loads from localStorage, handles migrations, provides all state setters, auto-syncs to server
- **`app/page.tsx`** - Main app orchestration. Renders all panels, manages word card grid, spaced repetition UI
- **`app/api/sync/route.ts`** - GET/POST endpoints for user data sync
- **`lib/db/`** - Drizzle ORM layer:
  - `schema.ts` - Database schema definitions
  - `client.ts` - Drizzle connection
  - `queries/` - CRUD operations for each table
- **`lib/sync.ts`** - Client-side sync utilities with debouncing
- **`lib/words.ts`** - Word normalization and STAGES array (11 spaced repetition intervals)
- **`slova.js`** - Raw word data (~216 words with id, cz, en, vi, pronunciations, hints)
- **`lib/storage.ts`** - localStorage utilities with legacy data migration support

### Database Schema (PostgreSQL)

Five tables:
- `words` - Vocabulary (id, category[], cz, en, vi, pronunciations, hints)
- `users` - Users (device_id, email, wallet_address for future auth)
- `user_progress` - Spaced repetition progress per word
- `user_memory_hooks` - Custom memory notes
- `user_category_filters` - Selected categories

### Spaced Repetition

11 stages from "New" (0) to "60 days" (10). `markKnown()` advances +1, `markReallyKnown()` +2, `markUnknown()` -1. Word is due when `nextDueAt <= now` or `stageIndex = 0`.

## Important Notes

- **Device ID consent**: `lib/device-id.ts` implements explicit consent handling before creating IDs
- **Data migration**: System supports migrating from old numeric indices and hash-based IDs to new "w000" format
- **Tailwind output**: Generated to `app/.generated/tailwind.css`
- **No test framework** currently configured
