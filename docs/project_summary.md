---
name: Project Summary — Wordlink
description: High-level overview of the Wordlink language-learning app — stack, architecture, key files, and conventions
type: project
---

## What it is

**Wordlink** is a personal language-learning web app (Next.js 15 / React 19). It presents vocabulary cards with spaced repetition, inline minigames, and wallet-based identity. Deployed on Vercel, backed by Supabase Postgres.

**Why:** Self-hosted alternative to Anki / Duolingo, with wallet auth so progress is tied to a crypto wallet rather than an account.

## Tech stack

| Layer | Choice |
|---|---|
| Framework | Next.js 15 (App Router), React 19 |
| Styling | Tailwind v4 via `@tailwindcss/cli` (not PostCSS). Input: `app/tailwind.css`, output: `app/.generated/tailwind.css` (gitignored). **Always run `pnpm dev`**, not `next dev` directly. |
| Database | Postgres via Supabase, Drizzle ORM |
| Auth | Device auth (cookie UUID) + optional wallet auth (Reown/WalletConnect + wagmi) |
| Package manager | pnpm |
| Tests | Vitest (`pnpm test`) |
| Deployment | Vercel |

## Repository layout

```
app/
  page.tsx          — main learning view
  edit/page.tsx     — editor-only word editing
  layout.tsx        — root layout
  api/
    sync/           — GET/POST user state hydration & persistence
    words/          — GET/POST word data (editor only)
    auth/           — link-wallet endpoint
    users/
components/         — all React components (AppLayout, WordCard, MiniGameCard, CardDeckView, …)
context/
  AppStateContext.tsx — React context wrapping appState for panels/layout
hooks/              — all custom hooks
lib/
  words.ts          — STAGES (0–10 spaced repetition), isDue(), word stream logic
  minigames.ts      — multipleChoice, typing, matching game types
  db/
    schema.ts       — Drizzle schema (users, words, user_progress, user_memory_hooks, user_category_filters)
    client.ts       — DB client
    queries/        — entity-level query files
  sync.ts           — client-side sync helpers
  auth.ts           — JWT session helpers
  device-id.ts      — deviceId cookie generation
  wagmi-config.ts   — WalletConnect config
styles/             — plain CSS per concern (layout.css, word-card.css, themes.css, …)
data/words          — raw word data
scripts/            — DB migration/seed/backup scripts
```

## State architecture (post 2026-03-08 refactor)

- **`useAppState`** is a thin orchestrator (~137 lines) composing 7 domain hooks:
  `useTheme`, `useUserProfile`, `useProgress`, `usePreferences`, `useMemoryHooks`, `useCategoryFilter`, `useGameScore`
- Each domain hook accepts `(isHydrated, isUpdatingFromServerRef)` and owns its own server sync
- **`AppStateContext`** — pages wrap with `<AppStateProvider>` so components/panels read state directly
- **`useMenuPanels`** — panel open/close state (enum: `settings | progress | category | memoryHooks`), lives inside `AppLayout`, NOT passed from pages

## Shared utility hooks

- `usePressHandlers(containerRef, deps)` — MutationObserver press state (deduped from both pages)
- `useWordStream(filteredWords, progress, isHydrated)` — due/new/settling word bucketing (deduped)

## Spaced repetition

11 stages (0–10) in `lib/words.ts:STAGES`. Stage 0 = new/forgotten, stage 10 = 60 days. Progress per `(userId, wordId)` in `user_progress`. `isDue()` checks `nextDueAt`. Word stream: due words first → new words; settling words on demand.

## Minigames (`lib/minigames.ts`)

Three types: `multipleChoice`, `typing`, `matching`. Anchored by `anchorOriginalIndex` from the original word snapshot — stable as words leave the active stream. Game word sets locked in a ref on first generation; reset only when category filters change.

## Auth

- **Device auth**: `deviceId` cookie (UUID), `x-device-id` header on every request, API creates user on first contact
- **Wallet auth**: Reown/WalletConnect via wagmi, `/api/auth/link-wallet` associates wallet with device user
- Session: signed JWT cookie (`WORDLINK_SESSION_COOKIE_NAME`). `userRole: 'user' | 'editor'` gates `/edit`

## CSS conventions

- Tailwind for all new styling
- Do NOT refactor existing `styles/*.css` — separate future task
- CSS custom properties are the design system (`--accent`, `--bg`, `--text`, `--text-soft`, `--border-subtle`, etc.) in `styles/themes.css` and `app/globals.css`
- Three themes: `default` (dark navy), `warm` (light), `calm` (light) — stored in `localStorage`, applied via `data-theme` on `<html>`

## DB scripts

```
pnpm db:generate   — Drizzle generate migrations
pnpm db:migrate    — run migrations
pnpm db:push       — push schema
pnpm db:studio     — Drizzle Studio
pnpm db:seed       — seed word data
pnpm db:backup     — backup remote DB
```
