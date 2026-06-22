# AI Context

Use this file as the first stop for Codex, Claude Code, and other coding agents. It is intentionally short and task-oriented so an agent can find the right files without reading the whole repository.

## Project

Get Word is a Next.js multilingual language-learning app with device/session auth, wallet linking, spaced repetition, list editing, translation, and generated pronunciation audio. It supports configurable language pairs backed by Google-supported translation languages, with Czech/Vietnamese as historical/default featured languages rather than a hard product boundary. PostgreSQL access goes through Drizzle in `lib/db`.

## Placement Cheat Sheet

- `app/*`: route entrypoints only. Keep pages as composition shells and API routes as request/response shells.
- `features/*`: product/domain behavior for one capability. Put feature hooks, state, server services, types, and feature-only UI here.
- `components/*`: shared React UI. If UI is feature-specific, prefer `features/<feature>/components/*` during refactors.
- `lib/*`: shared non-UI foundations such as DB, auth/session, storage, network helpers, sync mechanics, and reusable pure helpers.
- `hooks/*`: truly app-wide hooks only. Feature workflow hooks belong under `features/<feature>/hooks/*`.

## Start Here By Task

### Learning page behavior

- Page shell: `app/page.tsx`
- Composition: `features/learning/components/LearningStudyContent.tsx`
- Page state: `features/learning/hooks/useLearningPageState.ts`
- Synced study-item loading: `features/learning/app-state/useServerSync.ts`
- Stream/deck grouping: `features/learning/hooks/useLearningStreamGroups.ts`
- Render callbacks: `features/learning/hooks/useLearningRenderers.tsx`
- PWA install intro state: `features/learning/hooks/usePWAInstallIntro.ts`
- Reveal interaction preview: add `?previewRevealFresh=1` to simulate a fresh user without changing stored familiarity
- Language onboarding UI: `features/learning/onboarding/LearningLanguageOnboarding.tsx`
- Language onboarding data/loading: `features/learning/onboarding/useLearningOnboardingData.ts`
- Language onboarding actions/navigation: `features/learning/onboarding/useLearningOnboardingActions.ts`
- Onboarding recommendations/estimates: `features/learning/onboarding/listRecommendations.ts`
- Onboarding language picker: `features/learning/onboarding/LanguageCombobox.tsx`

### Learning state and sync

- App state orchestrator: `hooks/useAppState.ts`
- Server hydration/link sync: `features/learning/app-state/useServerSync.ts`
- Progress/preferences/hooks/filter state: `features/learning/state/*`
- Sync API route: `app/api/sync/route.ts`
- Sync response assembly: `features/shared/sync/response.ts`
- Sync cursor parsing: `features/shared/sync/cursor.ts`
- Route database retry helpers: `features/shared/routes/database-retry.ts`
- Sync payload types: `features/sync/types.ts`
- Word-list hydration/response assembly: `features/shared/sync/response.ts`

### Lists editor

- Current page shell and wizard coordinator: `app/lists/page.tsx`
- Legacy editor redirect: `app/edit/page.tsx` redirects to `/lists`
- Wizard step state + handlers: `features/lists/hooks/useListsWizard.ts`
- List API client actions: `features/lists/client/actions.ts`
- List API fetch wrapper: `features/lists/api.ts`
- Canonical list types: `features/lists/types.ts`
- URL state helpers: `features/lists/client/url-state.ts`
- Local preference storage: `features/lists/client/storage.ts`
- Language helpers/loading: `features/lists/languages.ts`, `features/lists/hooks/useLearningLanguages.ts`
- Google usage loading: `features/lists/hooks/useGoogleUsage.ts`
- Lists page data/loading/subscriptions: `features/lists/hooks/useListsPageData.ts`
- Lists detail loading/category mutations: `features/lists/hooks/useListsDetailsData.ts`
- Lists fork dialog/state/actions: `features/lists/hooks/useListsForking.ts`
- Lists page select/create/update/edit actions: `features/lists/hooks/useListsPageActions.ts`
- Audio-step row UI: `features/lists/audio-step/AudioStepRow.tsx`
- Audio-step row/source mapping: `features/lists/audio-step/rows.ts`
- Audio-step playback + cache: `features/lists/audio-step/useAudioPlayback.ts`
- Audio-step generation/regeneration workflow: `features/lists/audio-step/useAudioGenerationWorkflow.ts`
- Audio-step Google TTS voice selection: `features/lists/audio-step/useGoogleTtsVoiceSelection.ts`
- Audio-step reusable audio lookup/linking: `features/lists/audio-step/useReusableAudioLookup.ts`
- Wizard item selectors: `features/lists/hooks/useListWizardItems.ts`
- Main list UI pieces: `app/lists/ListSidebar.tsx`, `app/lists/CategoryBrowser.tsx`, `app/lists/TextareaEditor.tsx`, `app/lists/TranslationStep.tsx`, `app/lists/AudioStep.tsx`, `app/lists/PendingForkDialog.tsx`

### Audio

- Audio feature guide: `features/audio/README.md`
- Client list audio workflow: `app/lists/AudioStep.tsx`
- Batch generation route shell: `app/api/audio/generate/batch/route.ts`
- Batch generation service: `features/audio/server/generate-batch.ts`
- Audio lookup/storage helpers: `lib/audio.ts`, `lib/audio-assets.ts`, `lib/audio-storage.ts`, `lib/audio-availability.ts`

### Auth and providers

- Auth feature guide: `features/auth/README.md`
- Client auth hook: `features/auth/client/useAuth.ts`
- Supabase clients + config: `features/auth/supabase/browser.ts`, `features/auth/supabase/server.ts`, `features/auth/supabase/env.ts`
- Identity resolution (Supabase → app user): `features/auth/server/resolve-supabase-user.ts`
- Login + session handoff: `app/login/page.tsx`, `app/api/auth/callback/route.ts` (OAuth/magic-link), `app/api/auth/sync-user/route.ts` (email OTP), `app/api/auth/me/route.ts`, `lib/sync.ts`
- Wallet linking (currently disabled, returns 410): `app/api/auth/link-wallet/route.ts`
- User profile state: `features/auth/state/userProfile.ts`
- Route auth/session helpers: `lib/auth.ts`, `lib/session.ts`, `lib/device-id.ts`, `features/shared/routes/session.ts`, `proxy.ts`
- OpenRouter/provider guide: `features/providers/README.md`
- Provider storage/crypto: `lib/providers/*`

### Database

- Schema: `lib/db/schema.ts`
- Query barrel: `lib/db/index.ts`
- Entity queries: `lib/db/queries/*`
- Word-list item queries are split by concern under `lib/db/queries/word-list-items/*`
- Study vocabulary lives in `word_lists`/`word_list_items`; the legacy `words` table is gone.
- Canonical and only checked-in migrations: `drizzle/migrations/*`
- Historical manual Supabase/RLS scripts removed from the old root `migrations/` directory are available through Git history if needed.

## Do Not Read Unless Needed

- `.claude/worktrees/`: local worktree copies and stale duplicate app files.
- `.next/`, `.next-dev/`, `out/`, `build/`, `coverage/`: generated output.
- `.pnpm-store/`, `node_modules/`: dependencies.
- `public/speech/`: static audio assets; read only for asset inventory tasks.
- `wordbook/`: source word-list scratch/import material; read only for data import tasks.
- `drizzle/migrations/meta/*.json`: generated snapshots; read only for migration debugging.
- `styles/*.css`: legacy styling. New styling should use Tailwind. Read these only when modifying existing legacy classes.
- `ralph/`: autonomous CLI orchestrator (`planner.js`/`executor.js`/`progress.js`). Unrelated to the runtime app.
- `schema_only.sql`: historical schema snapshot. Source of truth is `lib/db/schema.ts`.
- `lib/i18n/messages.ts`: ~940-line translation table; treat as data.
- `docs/plans/archive/`: completed refactor plans kept for history.

## Current Hotspots

- `app/lists/page.tsx` is the lists coordinator. Wizard step state lives in `features/lists/hooks/useListsWizard.ts`; the page owns list/category/items, sidebar, settings, subscriptions, google-usage, error, and fork state. Extract more focused hooks rather than adding new state in the page.
- `app/lists/AudioStep.tsx` still owns row state, generation, voice selection, and the JSX surface. Playback/cache/error machinery lives in `features/lists/audio-step/useAudioPlayback.ts`; pure row/source and API parsing helpers live under `features/lists/audio-step/*`.
- `app/api/sync/route.ts` is behaviorally central and contains legacy compatibility paths. Keep route shape stable and extract internals carefully.
- `features/learning/onboarding/LearningLanguageOnboarding.tsx` is now mostly the onboarding UI shell. Data loading and derived list state live in `features/learning/onboarding/useLearningOnboardingData.ts`; subscribe/fork/create/autogenerate navigation actions live in `features/learning/onboarding/useLearningOnboardingActions.ts`. The old `components/LearningLanguageOnboarding.tsx` path is a compatibility export only.

## Boundary Rules

- `app/*/page.tsx` files should stay composition shells.
- API route files should parse requests, authorize, call feature/server services, and return responses.
- New feature-specific types belong in `features/<feature>/types.ts`, not page files.
- New list browser HTTP calls should go through `features/lists/api.ts` or `features/lists/client/actions.ts`.
- New learning state belongs under `features/learning/state` or `features/learning/app-state`.
- `lib/minigames.ts` is a compatibility barrel — prefer `@/features/learning/minigames` in new code.
- The former `hooks/use{Progress,Preferences,MemoryHooks,CategoryFilter,GameScore,UserProfile,WordsLoader,WordStream,PressHandlers}.ts` barrels were removed; import directly from `features/learning/state/*`, `features/learning/hooks/*`, and `features/auth/state/userProfile`.

## Refactor Rules

- Prefer small safe extractions over rewrites.
- Preserve HTTP routes and response shapes unless a task explicitly allows an API migration.
- Preserve legacy wordId/itemId sync compatibility unless the task is specifically to remove it.
- Do not reintroduce the legacy `words` table, `/api/words`, or a seed-word fallback; learning data is hydrated from owned/subscribed lists through `/api/sync`.
- Do not refactor legacy CSS as part of code-structure work.
- Add or adjust focused tests when moving state, sync, route, audio, or wizard behavior.

## Test Map

- General: `pnpm test`
- Lint: `pnpm run lint`
- Learning state/minigames: `features/learning/**/__tests__`, `lib/__tests__/minigames.test.ts`
- Lists: `app/lists/__tests__`, `app/api/lists/__tests__`
- Audio: `app/api/audio/__tests__`, `lib/__tests__/audio*.test.ts`
- Sync: `app/api/sync/__tests__/sync.test.ts`, `lib/__tests__/sync*.test.ts`, `features/learning/state/__tests__`
- Auth/providers: `app/api/auth/__tests__`, `app/api/providers/openrouter/__tests__`, `lib/providers/__tests__`
