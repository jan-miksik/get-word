# CLAUDE.md

> Architecture and conventions live here. Task-oriented navigation ("where do I look for X?") lives in [`AI_CONTEXT.md`](AI_CONTEXT.md). Codex/AGENTS readers: see [`AGENTS.md`](AGENTS.md) — it points back to these two files.

## Styling

Use Tailwind for all new styling. Do not refactor existing CSS in `styles/*.css` — that is a separate future task.


## Architecture

### Code placement

Use this decision tree before adding or moving code:

- `app/*` is for Next.js route entrypoints. Pages should compose feature UI/state; API routes should parse, authorize, call services/helpers, and return responses.
- `features/<feature>/*` is for product/domain behavior owned by one capability, such as learning, lists, audio, auth, providers, edit, or sync.
- `components/*` is for shared React UI that is reused across features or represents app-wide UI. Feature-only UI should move toward `features/<feature>/components/*`.
- `lib/*` is for shared non-UI foundations: database access, auth/session helpers, storage, network policy, sync mechanics, reusable pure helpers, and domain primitives used by multiple features.
- `hooks/*` is for truly app-wide React hooks. Feature workflow hooks belong in `features/<feature>/hooks/*`.

If a file needs product context to explain why it exists, prefer `features/<feature>`. If it is reusable infrastructure with no UI, prefer `lib`. If it only renders UI and owns little behavior, prefer `components` or a feature-local `components` folder.

### CSS / Tailwind

Tailwind v4 is compiled by Next/PostCSS from `app/tailwind.css`. Development runs through Turbopack with `pnpm run dev`; use `pnpm run dev:fast` to disable dev source maps during tight UI/state iteration.

Plain CSS lives in `styles/*.css` (one file per concern: `layout.css`, `word-card.css`, `panels.css`, `top-menu.css`, `minigames.css`, etc.). These are imported in `app/globals.css`.

CSS custom properties are the design system (defined in `styles/tokens.css` and `app/globals.css`): `--accent`, `--bg`, `--text`, `--text-soft`, `--border-subtle`, etc. Three themes: `default` (dark navy), `warm` (light), `calm` (light). Theme is stored in `localStorage` and applied via `data-theme` on `<html>`.

### Data flow

```
/api/words       →  features/learning/hooks/useWordsLoader  →  page.tsx
                                           ↓
                                      useAppState   ←→   lib/sync.ts  ←→  /api/sync
                                           ↓
                                      AppLayout (useMenuPanels internally)
                                           ↓
                                      WordCard / MiniGameCard / CardDeckView
```

**`useAppState`** (`hooks/useAppState.ts`) is now a thin orchestrator over feature-owned state:
- `features/learning/app-state/*` for hydration, wallet-link sync, and local UI persistence
- `features/learning/state/*` for progress, preferences, memory hooks, category filters, and game score
- `features/auth/state/userProfile.ts` for synced identity fields

Import directly from feature paths: `features/learning/state/*`, `features/learning/hooks/*`, and `features/auth/state/userProfile`. The previous top-level `hooks/use*` compatibility barrels were removed.

**`useMenuPanels`** (`hooks/useMenuPanels.ts`) owns panel open/close state (`settings`, `progress`, `category`, `memoryHooks`) as a single enum, inside `AppLayout`. Panel state is NOT passed from pages — `AppLayout` manages it internally.

### Spaced repetition

11 stages (0–10) in `lib/words.ts:STAGES` — 0 = new/forgotten through 10 = 60 days. Progress tracked per (userId, wordId) in `userProgress` table. `isDue()` checks `nextDueAt`. Word stream: due words first, then new words; settling words shown on demand.

### Minigames

`lib/minigames.ts` is a compatibility barrel. New minigame work should start in `features/learning/minigames/*`. Games are anchored by `anchorOriginalIndex` in the original word snapshot so they stay stable as words are removed from the active stream. Game word sets are locked in a ref on first generation and only reset when category filters change.

### Auth

Two layers:
- **Device auth**: `deviceId` cookie (random UUID, see `lib/device-id.ts`). Every request sends `x-device-id` header. API creates a user on first contact.
- **Wallet auth**: Reown/WalletConnect via wagmi (`features/auth/client/wagmi-config.ts`, `features/auth/client/useAuth.ts`). On connect, calls `/api/auth/link-wallet` to associate wallet with the device user.

Session is a signed JWT cookie (`GET_WORD_SESSION_COOKIE_NAME`). `userRole: 'user' | 'editor'` controls access to `/edit`.

### Database

Drizzle ORM + Postgres (Supabase). Schema: `lib/db/schema.ts`. Queries split by entity in `lib/db/queries/`. Client in `lib/db/client.ts`.

Tables: `users`, `words`, `user_progress`, `user_memory_hooks`, `user_category_filters`.

### Views

- **Card mode** (`CardDeckView`): swipe-style fullscreen deck. Monkey emoji button appears on the card itself on mobile (hidden from top bar).
- **Stream mode** (`VirtualizedWordList`): virtualized scrolling list with minigames injected inline.

View mode stored in `localStorage` under `get-word-view-mode`.

### Pages

- `app/page.tsx` — thin learning-page composition shell
  - behavior lives in `features/learning/components/LearningStudyContent.tsx`
  - page state lives in `features/learning/hooks/useLearningPageState.ts`
- `app/edit/page.tsx` — thin editor-page composition shell
  - behavior lives in `features/edit/components/EditStudyContent.tsx`
  - page state lives in `features/edit/hooks/useEditPageState.ts`
- `app/api/sync/route.ts` — GET (hydrate) / POST (save) for all user state
- `app/api/words/route.ts` — GET / POST for word data (editor only)
- `app/api/auth/link-wallet/route.ts` — POST to link wallet to existing user
