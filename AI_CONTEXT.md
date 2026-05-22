# AI Context

Use this file as the first stop for Codex, Claude Code, and other coding agents. It is intentionally short and task-oriented so an agent can find the right files without reading the whole repository.

## Project

Get Word is a Next.js multilingual language-learning app with device/session auth, wallet linking, spaced repetition, list editing, translation, and generated pronunciation audio. It supports configurable language pairs backed by Google-supported translation languages, with Czech/Vietnamese as historical/default featured languages rather than a hard product boundary. PostgreSQL access goes through Drizzle in `lib/db`.

## Start Here By Task

### Learning page behavior

- Page shell: `app/page.tsx`
- Composition: `features/learning/components/LearningStudyContent.tsx`
- Page state: `features/learning/hooks/useLearningPageState.ts`
- Word loading: `features/learning/hooks/useWordsLoader.ts`
- Stream/deck grouping: `features/learning/hooks/useLearningStreamGroups.ts`
- Render callbacks: `features/learning/hooks/useLearningRenderers.tsx`

### Learning state and sync

- App state orchestrator: `hooks/useAppState.ts`
- Server hydration/link sync: `features/learning/app-state/useServerSync.ts`
- Progress/preferences/hooks/filter state: `features/learning/state/*`
- Sync API route: `app/api/sync/route.ts`
- Sync response assembly: `features/shared/sync/response.ts`
- Sync cursor parsing: `features/shared/sync/cursor.ts`
- Route database retry helpers: `features/shared/routes/database-retry.ts`
- Sync payload types: `features/sync/types.ts`

### Lists editor

- Current page shell and wizard coordinator: `app/lists/page.tsx`
- List API client actions: `features/lists/client/actions.ts`
- List API fetch wrapper: `features/lists/api.ts`
- Canonical list types: `features/lists/types.ts`
- URL state helpers: `features/lists/client/url-state.ts`
- Local preference storage: `features/lists/client/storage.ts`
- Language helpers/loading: `features/lists/languages.ts`, `features/lists/hooks/useLearningLanguages.ts`
- Audio-step row/source mapping: `features/lists/audio-step/rows.ts`
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
- Client auth hook: `hooks/useAuth.ts`
- User profile state: `features/auth/state/userProfile.ts`
- Route auth helpers: `lib/auth.ts`, `features/shared/routes/session.ts`
- OpenRouter/provider guide: `features/providers/README.md`
- Provider storage/crypto: `lib/providers/*`

### Database

- Schema: `lib/db/schema.ts`
- Query barrel: `lib/db/index.ts`
- Entity queries: `lib/db/queries/*`
- Word-list item queries are split by concern under `lib/db/queries/word-list-items/*`
- Canonical Drizzle migrations: `drizzle/migrations/*`
- Root `migrations/*` are legacy/manual Supabase/RLS SQL unless a task explicitly says otherwise.

## Do Not Read Unless Needed

- `.claude/worktrees/`: local worktree copies and stale duplicate app files.
- `.next/`, `.next-dev/`, `out/`, `build/`, `coverage/`: generated output.
- `.pnpm-store/`, `node_modules/`: dependencies.
- `public/speech/`: static audio assets; read only for asset inventory tasks.
- `wordbook/`: source word-list scratch/import material; read only for data import tasks.
- `drizzle/migrations/meta/*.json`: generated snapshots; read only for migration debugging.
- `styles/*.css`: legacy styling. New styling should use Tailwind. Read these only when modifying existing legacy classes.

## Current Hotspots

- `app/lists/page.tsx` is still the largest active coordinator. Prefer extracting focused hooks rather than adding more state there.
- `app/lists/AudioStep.tsx` mixes UI, playback, cache, reuse lookup, and generation actions. Prefer extracting audio client hooks/helpers before adding new behavior.
- `app/api/sync/route.ts` is behaviorally central and contains legacy compatibility paths. Keep route shape stable and extract internals carefully.
- `components/LearningLanguageOnboarding.tsx` spans onboarding, list matching, common-list generation, and audio repair messaging.

## Boundary Rules

- `app/*/page.tsx` files should stay composition shells.
- API route files should parse requests, authorize, call feature/server services, and return responses.
- New feature-specific types belong in `features/<feature>/types.ts`, not page files.
- New list browser HTTP calls should go through `features/lists/api.ts` or `features/lists/client/actions.ts`.
- New learning state belongs under `features/learning/state` or `features/learning/app-state`.
- Top-level `hooks/useProgress.ts`, `hooks/usePreferences.ts`, `hooks/useMemoryHooks.ts`, `hooks/useCategoryFilter.ts`, `hooks/useGameScore.ts`, `hooks/useUserProfile.ts`, `hooks/useWordsLoader.ts`, `hooks/useWordStream.ts`, `hooks/usePressHandlers.ts`, and `lib/minigames.ts` are compatibility barrels. Prefer feature-local imports in new code.

## Refactor Rules

- Prefer small safe extractions over rewrites.
- Preserve HTTP routes and response shapes unless a task explicitly allows an API migration.
- Preserve legacy wordId/itemId sync compatibility unless the task is specifically to remove it.
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
