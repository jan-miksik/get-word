# CLAUDE.md

> Architecture and conventions live here. Task-oriented navigation ("where do I look for X?") lives in [`AI_CONTEXT.md`](AI_CONTEXT.md). Codex/AGENTS readers: see [`AGENTS.md`](AGENTS.md) — it points back to these two files.

These two files are the authoritative general repository documentation. Keep
feature-specific detail in `features/*/README.md` and durable subsystem design
notes in `docs/`; do not add another general codebase map.

## Verification

- `pnpm run typecheck` — TypeScript without emitting or updating incremental state.
- `pnpm run lint` — repository ESLint baseline.
- `pnpm test` — complete Vitest suite.
- `pnpm run check:dead-code` — report-only Knip analysis; never use automated deletion.
- `pnpm run check` — full local verification, including the production build.

## Styling

Use Tailwind for all new styling. Do not refactor existing CSS in `styles/*.css` — that is a separate future task.


## Architecture

### Code placement

Use this decision tree before adding or moving code:

- `app/*` is for Next.js route entrypoints. Pages should compose feature UI/state; API routes should parse, authorize, call services/helpers, and return responses.
- `features/<feature>/*` is for product/domain behavior owned by one capability, such as learning, lists, audio, auth, providers, or sync.
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
/api/sync  →  features/learning/app-state/useServerSync  →  useAppState  →  HomeClient
                                                              ↓
                                               synced word_list_items
                                                              ↓
                                           WordCard / MiniGameCard / CardDeckView
```

The learning app has no seed-word fallback or `/api/words` loader. Its study
items come from subscribed and owned `word_lists`, hydrated through `/api/sync`.

**`useAppState`** (`hooks/useAppState.ts`) is now a thin orchestrator over feature-owned state:
- `features/learning/app-state/*` for hydration, wallet-link sync, and local UI persistence
- `features/learning/state/*` for progress, preferences, memory hooks, category filters, and game score
- `features/auth/state/userProfile.ts` for synced identity fields

Import directly from feature paths: `features/learning/state/*`, `features/learning/hooks/*`, and `features/auth/state/userProfile`. The previous top-level `hooks/use*` compatibility barrels were removed.

**`useMenuPanels`** (`hooks/useMenuPanels.ts`) owns panel open/close state (`settings`, `progress`, `category`, `memoryHooks`) as a single enum, inside `AppLayout`. Panel state is NOT passed from pages — `AppLayout` manages it internally.

### Spaced repetition

11 stages (0–10) in `lib/words.ts:STAGES` — 0 = new/forgotten through 10 = 60 days. Progress is tracked per `(userId, wordListItemId)` in `user_progress`; the nullable `word_id` column remains only for legacy sync compatibility. `isDue()` checks `nextDueAt`. Word stream: due words first, then new words; settling words shown on demand.

### Minigames

Minigame domain logic lives in `features/learning/minigames/*`; learning-owned game, deck, stream, and word-card UI lives in `features/learning/components/*`. Import those paths directly—there is no `lib/minigames.ts` compatibility barrel. Games are anchored by `anchorOriginalIndex` in the original word snapshot so they stay stable as words are removed from the active stream. Game word sets are locked in a ref on first generation and only reset when category filters change.

### Auth

Two layers:
- **Device auth**: `deviceId` cookie (random UUID, see `lib/device-id.ts`). Every request sends `x-device-id` header. API creates a user on first contact.
- **Login auth**: Supabase Auth (email one-time code + Google OAuth) acts as a one-shot identity verifier. The browser/server Supabase clients live in `features/auth/supabase/*`; `app/api/auth/callback/route.ts` (OAuth/magic-link) and `app/api/auth/sync-user/route.ts` (email OTP) verify the Supabase user, then `features/auth/server/resolve-supabase-user.ts` resolves/attaches the app `users` row (by `supabase_auth_id` → email → device claim → create). The client hook is `features/auth/client/useAuth.ts`.

After verification the app mints its own long-lived signed `get_word_session` cookie (see `lib/session.ts`), which is the trusted session — not Supabase's. `userRole: 'user' | 'editor'` controls privileged list operations. The old `/edit` route redirects to `/lists`.

Study direction comes from the selected list: `language_from` is the known/source
side and `language_to` is the learning/target side. The app no longer lets users
flip one list locally; a reverse study direction should use or generate a
separate reversed list.

Wallet linking is currently disabled (`app/api/auth/link-wallet/route.ts` returns 410); it will return as an additive feature gated behind a signed wallet-ownership challenge for the future stake layer.

### Database

Drizzle ORM + Postgres (Supabase). Schema: `lib/db/schema.ts`. Queries split by entity in `lib/db/queries/`. Client in `lib/db/client.ts`.

Core tables: `users`, `word_lists`, `word_categories`, `word_list_items`, `user_list_subscriptions`, `user_progress`, `review_events`, `user_memory_hooks`, and `user_category_filters`. The legacy `words` and `processed_client_ops` tables have been dropped.

### Views

- **Card mode** (`CardDeckView`): swipe-style fullscreen deck. Monkey emoji button appears on the card itself on mobile (hidden from top bar).
- **Stream mode** (`VirtualizedWordList`): virtualized scrolling list with minigames injected inline.

View mode stored in `localStorage` under `get-word-view-mode`.

### Pages

- `app/page.tsx` — thin learning-page composition shell
  - behavior lives in `features/learning/components/LearningStudyContent.tsx`
  - page state lives in `features/learning/hooks/useLearningPageState.ts`
- `app/lists/page.tsx` — list browser/editor and creation wizard coordinator
- `app/edit/page.tsx` — compatibility redirect to `/lists`
- `app/admin/stats/page.tsx` — thin shell for `features/admin/components/AdminStatsPage.tsx`
- `app/photo-lab/page.tsx` — metadata/font shell for `features/photo-lab/components/PhotoLabPage.tsx`
- signed-out landing UI — `features/landing/components/*`; `app/page.tsx` selects it by session
- `app/api/audio/demo/route.ts` — public HTTP/cache shell for `features/landing/server/getDemoAudio.ts`
- `app/api/sync/route.ts` — HTTP/auth shell for GET hydration and POST acknowledgements
  - mutation application: `features/sync/server/apply-mutations.ts`
  - conditional/full payload reads: `features/sync/server/read-payload.ts`
  - session/device identity fallback: `features/sync/server/resolve-user.ts`
- `app/api/lists/*` — list, category, item, translation, subscription, and fork APIs
- `app/api/auth/callback/route.ts` — GET; Supabase OAuth/magic-link callback that mints the app session
- `app/api/auth/sync-user/route.ts` — POST; mints the app session after an email OTP verify
- `app/api/auth/me/route.ts` — GET; returns the current signed-in identity
- `app/api/auth/link-wallet/route.ts` — disabled (returns 410); reserved for future wallet ownership verification
