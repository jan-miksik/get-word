# CLAUDE.md

## Styling

Use Tailwind for all new styling. Do not refactor existing CSS in `styles/*.css` — that is a separate future task.


## Architecture

### CSS / Tailwind

Tailwind v4 is compiled by `@tailwindcss/cli` (not PostCSS). The input is `app/tailwind.css` and the output is `app/.generated/tailwind.css` (gitignored). **Always run `pnpm dev` not `next dev` directly** — otherwise Tailwind output won't exist.

Plain CSS lives in `styles/*.css` (one file per concern: `layout.css`, `word-card.css`, `panels.css`, `top-menu.css`, `minigames.css`, `themes.css`, etc.). These are imported in `app/globals.css`.

CSS custom properties are the design system (defined in `styles/themes.css` and `app/globals.css`): `--accent`, `--bg`, `--text`, `--text-soft`, `--border-subtle`, etc. Three themes: `default` (dark navy), `warm` (light), `calm` (light). Theme is stored in `localStorage` and applied via `data-theme` on `<html>`.

### Data flow

```
data/words       →  useWordsLoader  →  page.tsx
                                           ↓
                                      useAppState   ←→   lib/sync.ts  ←→  /api/sync
                                           ↓
                                      AppLayout (useMenuPanels internally)
                                           ↓
                                      WordCard / MiniGameCard / CardDeckView
```

**`useAppState`** (`hooks/useAppState.ts`) owns all app state: progress, memory hooks, selected categories, preferences, game score, user identity. It hydrates from the server on mount via `fetchUserData()` and debounces all mutations back via `debouncedSync()`. No localStorage — everything lives in Postgres.

**`useMenuPanels`** (`hooks/useMenuPanels.ts`) owns panel open/close state (`settings`, `progress`, `category`, `memoryHooks`) as a single enum, inside `AppLayout`. Panel state is NOT passed from pages — `AppLayout` manages it internally.

### Spaced repetition

11 stages (0–10) in `lib/words.ts:STAGES` — 0 = new/forgotten through 10 = 60 days. Progress tracked per (userId, wordId) in `userProgress` table. `isDue()` checks `nextDueAt`. Word stream: due words first, then new words; settling words shown on demand.

### Minigames

`lib/minigames.ts` — three game types: `multipleChoice`, `typing`, `matching`. Games are anchored by `anchorOriginalIndex` in the original word snapshot so they stay stable as words are removed from the active stream. Game word sets are locked in a ref on first generation and only reset when category filters change.

### Auth

Two layers:
- **Device auth**: `deviceId` cookie (random UUID, see `lib/device-id.ts`). Every request sends `x-device-id` header. API creates a user on first contact.
- **Wallet auth**: Reown/WalletConnect via wagmi (`lib/wagmi-config.ts`, `hooks/useAuth.ts`). On connect, calls `/api/auth/link-wallet` to associate wallet with the device user.

Session is a signed JWT cookie (`WORDLINK_SESSION_COOKIE_NAME`). `userRole: 'user' | 'editor'` controls access to `/edit`.

### Database

Drizzle ORM + Postgres (Supabase). Schema: `lib/db/schema.ts`. Queries split by entity in `lib/db/queries/`. Client in `lib/db/client.ts`.

Tables: `users`, `words`, `user_progress`, `user_memory_hooks`, `user_category_filters`.

### Views

- **Card mode** (`CardDeckView`): swipe-style fullscreen deck. Monkey emoji button appears on the card itself on mobile (hidden from top bar).
- **Stream mode** (`VirtualizedWordList`): virtualized scrolling list with minigames injected inline.

View mode stored in `localStorage` under `wordlink-view-mode`.

### Pages

- `app/page.tsx` — main learning view (card + stream)
- `app/edit/page.tsx` — editor-only word editing (redirects non-editors)
- `app/api/sync/route.ts` — GET (hydrate) / POST (save) for all user state
- `app/api/words/route.ts` — GET / POST for word data (editor only)
- `app/api/auth/link-wallet/route.ts` — POST to link wallet to existing user
