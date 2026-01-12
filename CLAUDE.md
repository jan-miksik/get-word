# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

WordLink is a language learning app for Czech and Vietnamese built with Next.js 15 (React 19), deployed on Cloudflare Pages with D1 (SQLite) for cross-device sync. Uses device-based identification with localStorage for offline persistence.

## Commands

```bash
pnpm run dev              # Dev server with Tailwind watcher (port 3000)
pnpm run build            # Production build (Next.js + OpenNext for Cloudflare)
pnpm run preview          # Build + local preview
pnpm run deploy:cf        # Deploy to Cloudflare Pages
pnpm lint                 # Run Next.js linter
pnpm db:migrate           # Apply D1 migrations locally
pnpm db:migrate:remote    # Apply D1 migrations in production
```

## Architecture

### Data Flow
```
Client (localStorage + useAppState)
  → debouncedSync (1s debounce)
  → /api/sync
  → lib/db.ts
  → Cloudflare D1
```

### Key Files

- **`hooks/useAppState.ts`** - Central state management hub. Loads from localStorage, handles migrations, provides all state setters, auto-syncs to server
- **`app/page.tsx`** - Main app orchestration (749 lines). Renders all panels, manages word card grid, spaced repetition UI
- **`app/api/sync/route.ts`** - GET/POST endpoints for user data sync
- **`lib/db.ts`** - All D1 database operations (batch upserts, CRUD for progress/hooks/filters)
- **`lib/sync.ts`** - Client-side sync utilities with debouncing
- **`lib/words.ts`** - Word normalization and STAGES array (11 spaced repetition intervals)
- **`slova.js`** - Raw word data (~65KB, 1000+ words with id, cz, en, vi, pronunciations, hints)
- **`lib/storage.ts`** - localStorage utilities with legacy data migration support

### Database Schema (D1)

Four tables: `users` (device_id based), `progress` (word_index + stage_index + due dates), `memory_hooks` (custom notes), `category_filters` (selected categories)

### Spaced Repetition

11 stages from "New" (0) to "60 days" (10). `markKnown()` advances +1, `markReallyKnown()` +2, `markUnknown()` -1. Word is due when `nextDueAt <= now` or `stageIndex = 0`.

## Important Notes

- **pnpm hoisting**: `.npmrc` has `shamefully-hoist=true` as Cloudflare workaround
- **D1 binding**: Must be named "DB" in wrangler.toml
- **Device ID consent**: `lib/device-id.ts` implements explicit consent handling before creating IDs
- **Data migration**: System supports migrating from old numeric indices and hash-based IDs to new "w000" format
- **Tailwind output**: Generated to `app/.generated/tailwind.css`
- **No test framework** currently configured
