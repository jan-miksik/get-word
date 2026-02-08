# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

WordLink is a language learning app for Czech and Vietnamese built with Next.js 15 (React 19), using Supabase PostgreSQL with Drizzle ORM. Deploys to Vercel. Device-based identification stored in localStorage; all user data syncs to remote DB only (no localStorage for progress/settings). Wallet/email auth via Reown AppKit (WalletConnect v2).

## Commands

```bash
pnpm run dev              # Dev server with Tailwind watcher (port 3000)
pnpm run build            # Production build
pnpm lint                 # ESLint (Next.js defaults, no custom config)
pnpm test                 # Run tests once (Vitest)
pnpm test:watch           # Watch mode tests
pnpm db:push              # Push schema to database (fast, no migrations)
pnpm db:generate          # Generate migration from schema changes
pnpm db:migrate           # Apply migrations
pnpm db:studio            # Open Drizzle Studio
pnpm db:seed              # Seed words from slova.js
pnpm db:backup            # Backup remote DB to backups/
```

## Environment Setup

Requires `.env.local` with `DATABASE_URL` pointing to Supabase PostgreSQL connection string. Optional `NEXT_PUBLIC_REOWN_PROJECT_ID` for wallet auth (app works in anonymous mode without it).

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

### Pages
- **`app/page.tsx`** - Main learning interface with word card grid, spaced repetition UI, virtualized lists
- **`app/edit/page.tsx`** - Edit mode for managing word content
- **`app/layout.tsx`** - Root layout wrapping AppKitProvider

### API Routes
- **`app/api/sync/route.ts`** - GET fetches user data by deviceId/userId; POST syncs progress, hooks, filters, preferences. Includes retry logic for Postgres statement timeouts.
- **`app/api/auth/link-wallet/route.ts`** - Wallet linking with cross-device merge logic (highest stageIndex wins for progress, union for filters)
- **`app/api/words/route.ts`** - Word data fetching

### State & Hooks
- **`hooks/useAppState.ts`** - Central state management. Fetches from DB on mount, syncs changes via debounced POST. Hydration timeout (10s) prevents UI blocking.
- **`hooks/useAuth.ts`** - Wraps Reown AppKit hooks (isConnected, address, email, signIn/signOut)
- **`hooks/useWordsLoader.ts`** - Fetches words from API with 10s timeout, falls back to local data
- **`hooks/useDueTimer.ts`** - Smart single-setTimeout timer for when next card becomes due (no polling)
- **`hooks/useTopMenuHandlers.ts`** - Top menu event handlers
- **`hooks/usePanelClose.ts`** - Click-outside-to-close for panels

### Components
- **`components/AppLayout.tsx`** - Main layout: AuthButton, TopMenu, settings/category/progress panels
- **`components/WordCard.tsx`** - Word card with spaced repetition controls, audio playback, flip animation
- **`components/EditableWordCard.tsx`** - Full edit mode word card
- **`components/VirtualizedWordList.tsx`** - `@tanstack/react-virtual` for performance
- **`components/SettingsPanel.tsx`** - Preferences: role, theme, toggles, account settings
- **`components/AppKitProvider.tsx`** - Reown AppKit provider (email + Google social login, embedded wallets only)

### Database Layer (`lib/db/`)
- `schema.ts` - Five tables: words, users, user_progress, user_memory_hooks, user_category_filters
- `client.ts` - Drizzle connection
- `queries/` - CRUD for each table, including wallet merge logic in `users.ts`

### Core Utilities
- **`lib/sync.ts`** - Client sync: fetchUserData, syncUserData, linkWallet, debouncedSync. Maintains in-memory `lastKnownUserId` for recovery.
- **`lib/words.ts`** - Word normalization (infers word vs phrase from token count), `STAGES` array (11 intervals), `isDue()` check.
- **`lib/device-id.ts`** - Device ID management. Falls back to in-memory ID if localStorage unavailable.
- **`lib/wagmi-config.ts`** - WagmiAdapter with SSR support, cookie storage, multi-chain (mainnet, polygon, arbitrum, base, optimism)
- **`slova.js`** - Word data (216 entries with id, cz, en, vi, pronunciations, hints)
- **`data/words.ts`** - TypeScript wrapper that imports, validates, and normalizes slova.js data

### Database Schema

Five tables with foreign key constraints and unique constraints:
- `words` - Vocabulary (id like "w000", category[], translations, pronunciations, hints)
- `users` - Device-based auth (device_id unique); email/wallet_address for wallet linking; `user_role` ('user'|'editor')
- `user_progress` - Spaced repetition per user+word (unique on userId+wordId)
- `user_memory_hooks` - Custom notes per user+word
- `user_category_filters` - Selected categories per user

### Spaced Repetition

11 stages: New (0) → 1min → 10min → 1hr → 8hr → 1day → 3days → 7days → 14days → 30days → 60days.
- `markKnown()` advances +1 stage
- `markReallyKnown()` advances +2 stages
- `markUnknown()` regresses -1 stage
- Word due when `nextDueAt <= now` (stage 0 always shown in "All" tab, not "Ready")

### Authentication & Authorization

Device-first with progressive wallet/email linking via Reown AppKit:
1. Anonymous users start with device ID (only localStorage item)
2. Can link wallet/email via Reown embedded wallets (email + Google social login)
3. Wallet linking merges data across devices (highest stageIndex wins, filters unioned)
4. Client provides wallet address from Reown SDK (trust model acceptable for learning app)

Role-based authorization (`user_role` column: 'user' | 'editor'):
- **`lib/auth.ts`** - `resolveUserFromRequest()` reads `x-device-id` header, `isEditor()` check
- **`/api/words`** - GET is public; POST/PUT/DELETE require editor role (401/403)
- **`middleware.ts`** - Redirects non-editors from `/edit` via `wordlink_user_role` cookie
- **`/edit` page** - Client-side guard redirects non-editors; sends `x-device-id` header on save
- Assign editor role: `UPDATE users SET user_role='editor' WHERE device_id='...'`

## Important Notes

- **DB-only storage**: Progress, preferences, memory hooks, and filters stored only in remote DB. Device ID is the only localStorage item.
- **Word IDs**: Format "w000", "w001", etc. Defined in `slova.js`, seeded to DB via `db:seed`.
- **Tailwind v4**: Uses CLI-based build (not PostCSS). Output goes to `app/.generated/tailwind.css`. Separate watcher process runs during dev.
- **Standalone output**: `next.config.js` uses `output: 'standalone'` for OpenNext/Cloudflare deployment.
- **Webpack aliases**: Optional `@wagmi/connectors` peer deps (Coinbase, MetaMask, Gemini, Porto) are stubbed to `lib/wagmi-empty-module.js` to prevent build errors.
- **Tests**: Vitest with jsdom, co-located in `__tests__/` directories. Setup in `lib/__tests__/setup.ts` includes `@testing-library/jest-dom`.
- **Path alias**: `@/*` maps to project root in both tsconfig and vitest config.
- **All interactive components** use `'use client'` directive (React 19 / Next.js App Router pattern).
