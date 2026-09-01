# AI Context

Use this file as the first stop for Codex, Claude Code, and other coding agents. It is intentionally short and task-oriented so an agent can find the right files without reading the whole repository.

## Project

Get Word is a Next.js multilingual language-learning app with device/session auth, spaced repetition, list editing, translation, and generated pronunciation audio. Wallet linking is currently disabled and reserved for a future ownership-verification flow. The app supports configurable language pairs backed by Google-supported translation languages, with Czech/Vietnamese as historical/default featured languages rather than a hard product boundary. PostgreSQL access goes through Drizzle in `lib/db`.

`CLAUDE.md` and this file are the only general repository maps. Feature-specific
details belong in `features/*/README.md`; `docs/` is reserved for durable
subsystem decisions and data-model notes.

## Placement Cheat Sheet

- `app/*`: route entrypoints only. Keep pages as composition shells and API routes as request/response shells.
- `features/*`: product/domain behavior for one capability. Put feature hooks, state, server services, types, and feature-only UI here.
- `components/*`: shared React UI. If UI is feature-specific, prefer `features/<feature>/components/*` during refactors.
- `lib/*`: shared non-UI foundations such as DB, auth/session, storage, network helpers, sync mechanics, and reusable pure helpers.
- `hooks/*`: truly app-wide hooks only. Feature workflow hooks belong under `features/<feature>/hooks/*`.
- `context/*`: app-wide React providers only; feature providers belong with their feature.

## Start Here By Task

### Learning page behavior

- Page shell: `app/page.tsx`
- Signed-in app orchestration: `features/learning/components/HomeClient.tsx`
- Onboarding and add-words surface renderers: `features/learning/components/LearningOnboardingContent.tsx`, `features/learning/components/LearningAddWordsSurface.tsx`
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
- Shared language picker: `features/shared/languages/LanguageCombobox.tsx`
- Supported-language client loading: `features/shared/languages/useSupportedLanguages.ts`
- Pre-login language-pair hand-off: `features/shared/languages/landingPairStorage.ts`

### Add words and word chat

- Feature guide and invariants: `features/word-chat/README.md`
- Add-words surface/tabs: `features/word-chat/components/AddWordsScreen.tsx`
- Flow composition: `features/word-chat/components/WordChatFlow.tsx`
- Client workflow controller: `features/word-chat/hooks/useWordChat.ts`
- Cancellable chat turns and stale-response guards: `features/word-chat/hooks/useChatTurn.ts`
- Durable interrupted-session draft: `features/word-chat/client/storage.ts`
- HTTP client and transport DTO inference: `features/word-chat/client/api.ts`
- Shared feature types: `features/word-chat/types.ts`
- Chat/proposal/translation/commit services: `features/word-chat/server/{chat,propose,translate,commit}.ts`
- Prompt assembly: `features/word-chat/server/prompt.ts`
- Public cross-feature client surface: `features/word-chat/public.client.ts`
- HTTP route shells: `app/api/word-chat/*/route.ts`

### Public landing

- Feature guide: `features/landing/README.md`
- Signed-out route selection: `app/page.tsx`
- Page composition: `features/landing/components/LandingPage.tsx`
- Static marketing sections/icons: `features/landing/components/LandingSections.tsx`, `LandingIcons.tsx`
- Interactive demo: `features/landing/components/LandingDemoCard.tsx`, `features/landing/components/demo/*`
- Public UI-language state: `features/landing/client/useLandingLanguage.ts`
- Demo-audio server assembly: `features/landing/server/getDemoAudio.ts`
- Generated/shared demo data: `lib/landing-demo-word-data.ts`, `lib/landing-demo-words.ts`

### Learning state and sync

- App state orchestrator: `hooks/useAppState.ts`
- Server hydration and React sync adapter: `features/learning/app-state/useServerSync.ts`
- Framework-neutral sync state machine: `packages/product/shared/sync/engine.ts`
- Typed durable outbox and recovery: `lib/local-first/operations.ts`, `lib/local-first/outbox.ts`, `lib/local-first/drainer.ts`
- Runtime sync contracts: `packages/contracts/src/sync.ts`
- Progress/preferences/hooks/filter state: `features/learning/state/*`
- Sync API route: `app/api/sync/route.ts`
- Sync mutation service: `features/sync/server/apply-mutations.ts`
- Sync read/payload service: `features/sync/server/read-payload.ts`
- Sync identity resolution: `features/sync/server/resolve-user.ts`
- Sync response assembly: `features/shared/sync/response.ts`
- Sync cursor parsing: `features/shared/sync/cursor.ts`
- Route database retry helpers: `features/shared/routes/database-retry.ts`
- Sync payload types: `features/sync/types.ts`
- Review-event local outbox operations: `features/sync/review-event-outbox.ts`
- Word-list hydration/response assembly: `features/shared/sync/response.ts`

### Lists editor

- Shared page shell and wizard coordinator: `features/lists/screens/ListsScreen.tsx` (`app/lists/page.tsx` is the Next route adapter)
- Legacy editor redirect: `app/edit/page.tsx` redirects to `/lists`
- Wizard step state + handlers: `features/lists/hooks/useListsWizard.ts`
- List API client actions: `features/lists/client/actions.ts`
- List API fetch wrapper: `features/lists/api.ts`
- Translation batch service: `features/translation/server/translate-batch.ts`
- Canonical list types: `features/lists/types.ts`
- URL state helpers: `features/lists/client/url-state.ts`
- Local preference storage: `features/lists/client/storage.ts`
- List-direction helpers: `features/lists/languages.ts`
- Shared language picker/loading/settings-language/types: `features/shared/languages/*`
- Google usage loading: `features/lists/hooks/useGoogleUsage.ts`
- Lists page data/loading/subscriptions: `features/lists/hooks/useListsPageData.ts`
- Lists detail loading/category mutations: `features/lists/hooks/useListsDetailsData.ts`
- Lists fork dialog/state/actions: `features/lists/hooks/useListsForking.ts`
- Lists server operations: `features/lists/server/*` (fork, accepted answers, item translation persistence)
- Lists page select/create/update/edit actions: `features/lists/hooks/useListsPageActions.ts`
- Audio-step row UI: `features/lists/audio-step/AudioStepRow.tsx`
- Audio-step row/source mapping: `features/lists/audio-step/rows.ts`
- Audio-step playback + cache: `features/lists/audio-step/useAudioPlayback.ts`
- Audio-step generation/regeneration workflow: `features/lists/audio-step/useAudioGenerationWorkflow.ts`
- Audio-step Google TTS voice selection: `features/lists/audio-step/useGoogleTtsVoiceSelection.ts`
- Audio-step reusable audio lookup/linking: `features/lists/audio-step/useReusableAudioLookup.ts`
- Wizard item selectors: `features/lists/hooks/useListWizardItems.ts`
- Main list UI pieces: `features/lists/components/list-sidebar/ListSidebar.tsx`, `features/lists/components/category-browser/CategoryBrowser.tsx`, `features/lists/components/TextareaEditor.tsx`, `features/lists/components/translation-step/TranslationStep.tsx`, `features/lists/audio-step/AudioStep.tsx`, `features/lists/components/PendingForkDialog.tsx`

### Audio

- Audio feature guide: `features/audio/README.md`
- Client list audio workflow and shell: `features/lists/audio-step/*`
- Batch generation route shell: `app/api/audio/generate/batch/route.ts`
- Batch generation service: `features/audio/server/generate-batch.ts`
- Audio lookup/reuse and serving services: `features/audio/server/reuse-batch.ts`, `features/audio/server/serve-audio.ts`
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

### Photo Lab

- Feature guide: `features/photo-lab/README.md`
- Route/font shell: `app/photo-lab/page.tsx`
- UI composition: `features/photo-lab/components/PhotoLabPage.tsx`
- Client workflow/history lifecycle: `features/photo-lab/components/usePhotoLabStudio.ts`
- Client API/storage: `features/photo-lab/client/*`
- Analysis/audio/rate-limit services: `features/photo-lab/server/*`
- HTTP shells: `app/api/photo-lab/*/route.ts`

### Design and styling

- Colour tokens (the only place a colour is defined): `styles/tokens.css`, paper-palette block
- Tailwind utilities for them (`bg-paper`, `text-ink`, `border-sea`): `@theme` in `app/tailwind.css`
- TypeScript handles + the `--ob-*` / `--game-*` variable sets: `features/shared/theme/warm-palette.ts`
- Hand-written CSS by concern: `styles/panels.css`, `styles/word-card.css`, `styles/minigames.css`, `styles/top-menu.css`, `styles/layout.css`
- Enforcement and the migration checklist: `pnpm run check:design-tokens` (`--report` for near-duplicate colours), `config/design-token-baseline.json`, `config/design-token-exempt.json`
- Open palette and button-language proposals: `app/dev/design-system/*` (dev-only route `/dev/design-system`)
- Conventions and the rule about never re-pointing a token: `CLAUDE.md` → Styling → Design tokens

### Admin and maintenance

- Admin guide and DTOs: `features/admin/README.md`, `features/admin/types.ts`
- Admin page + loading workflow: `features/admin/components/AdminStatsPage.tsx`, `features/admin/client/useAdminStats.ts`
- Admin API shell and DB aggregation: `app/api/admin/stats/route.ts`, `lib/db/queries/usage-stats.ts`
- Operator script map: `scripts/README.md`
- Shared demo-audio tooling policy: `scripts/lib/audio-quality.ts`

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
- `wordbook/`: source word-list scratch/import material; read only for data import tasks.
- `drizzle/migrations/meta/*.json`: generated snapshots; read only for migration debugging.
- `styles/*.css`: legacy styling. New styling should use Tailwind. Read these only when modifying existing legacy classes.
- `ralph/`: autonomous CLI orchestrator (`planner.js`/`executor.js`/`progress.js`). Unrelated to the runtime app.
- `schema_only.sql`: historical schema snapshot. Source of truth is `lib/db/schema.ts`.
- `lib/i18n/locales/*.ts`: bundled UI translation catalogs; search for a key and read only the relevant range.
- `lib/landing-demo-word-data.ts`, `components/scratch-field/motifs.ts`: generated/static data; do not hand-edit.

## Current Hotspots

- `features/word-chat/hooks/useWordChat.ts` is the word-chat workflow controller. It still coordinates draft restore, preferences, chat, selection, translation, commit, and retry behavior. Review-row transforms live in `hooks/review-items.ts`; synchronous Review state and background audio tracking live in `hooks/useReviewItemState.ts` and `hooks/useAudioJobQueue.ts`; clip retry/caching policy lives in `client/audio-generation.ts`. Extend those focused modules rather than moving these lifecycles back into the central hook.
- `features/lists/screens/ListsScreen.tsx` is the shared web/mobile composition shell. Lists UI lives under `features/lists/components`, while page data, maintenance actions, pending-audio state, forking, and wizard state live in focused `features/lists/hooks/*` hooks. Consumers enter through `features/lists/public.client.ts`.
- `features/lists/components/translation-step/TranslationStep.tsx` remains the largest lists shell. Provider workflow, pure transformations, row UI, editors, polish review, and bulk accepted-answer review are separate modules in the same folder; extend those modules instead of adding another responsibility to the shell.
- `features/lists/components/category-browser/CategoryBrowser.tsx` owns list/category orchestration; the generated-list repair preview is isolated in `category-browser/RepairPreviewModal.tsx` and its workflow lives in `useAutogeneratedListRepair.ts`.
- `app/api/sync/route.ts` is the stable HTTP/auth shell. Legacy item/word ID mutation compatibility lives in `features/sync/server/apply-mutations.ts`; conditional/delta/full reads live in `features/sync/server/read-payload.ts`.
- `features/learning/onboarding/LearningLanguageOnboarding.tsx` is now mostly the onboarding UI shell. Data loading and derived list state live in `features/learning/onboarding/useLearningOnboardingData.ts`; subscribe/fork/create/autogenerate navigation actions live in `features/learning/onboarding/useLearningOnboardingActions.ts`.
- `features/learning/components/HomeClient.tsx` coordinates boot, session state, and surface selection. Resumable onboarding rendering lives in `LearningOnboardingContent.tsx`; lazy add-words/Photo Lab composition lives in `LearningAddWordsSurface.tsx`.
- `features/admin/components/AdminStatsPage.tsx` composes the admin dashboard and its language/goal analytics. Keep new data retrieval in `lib/db/queries`, and extract another panel component instead of adding a new dashboard section inline.
- `features/admin/components/AdminQualityPoolPage.tsx` owns quality-pool loading, filters, history, and voice controls. Put reusable API state in `features/admin/client` and keep scan/audio serialization on the server side.
- `app/dev/design-system/button-personalities.ts` is intentionally a dev-only catalogue of button candidates and their CSS. Add interactive comparison tooling beside it (for example `press-variants.tsx`) rather than growing the catalogue module with runtime controls.
- `features/photo-lab/components/PhotoLabPage.tsx` is the render shell; analysis,
  local persistence, history refresh, audio enrichment, and blob URL cleanup live
  in `usePhotoLabStudio.ts`.
- `lib/db/queries/quality-pool.ts` is the stable quality-pool facade. Canonical pool-key/consent SQL lives in `quality-pool-shared.ts`; aggregate reads, admin writes, and learner suggestions/lifecycle live in the adjacent `quality-pool-{read,writes,suggestions}.ts` modules. Keep consumers on the facade unless they are implementing the query subsystem itself.
- `lib/db/queries/usage-stats.ts` is the remaining admin-query monolith. Put reusable time-window/normalization helpers in `stats-shared.ts`; prefer a focused query module for a new dashboard panel instead of extending the main function.
- Landing demo data is intentionally large/generated. Extend UI under
  `features/landing`, but regenerate `lib/landing-demo-word-data.ts` instead of
  hand-splitting or hand-editing it.

## Boundary Rules

- `app/*/page.tsx` files should stay composition shells.
- API route files should parse requests, authorize, call feature/server services, and return responses.
- Import runtime sync request contracts from `packages/contracts/src/sync.ts`; response compatibility remains in `features/sync/types.ts` and `lib/sync.ts` remains the low-level transport surface.
- Mobile must never import `app/**`. Shared screens are exposed through narrow `public.client.ts` entrypoints. Inside a feature, import internals directly rather than routing through its public entrypoint.
- Run `pnpm check:boundaries` after changing feature imports. It permits public client/server and contract entrypoints, rejects new internal cross-feature edges, and rejects stale allowlist entries after an edge is fixed.
- Run `pnpm check:ai-context` after changing a tracked hotspot. It rejects new source files over 1,000 lines and prevents existing orchestrators from growing past the ratcheted budgets in `config/ai-context-budgets.json`.
- New feature-specific types belong in `features/<feature>/types.ts`, not page files.
- New list browser HTTP calls should go through `features/lists/api.ts` or `features/lists/client/actions.ts`.
- New learning state belongs under `features/learning/state` or `features/learning/app-state`.
- Import minigame domain logic directly from `@/features/learning/minigames`; learning game/deck/stream/card UI belongs under `features/learning/components`.
- `usePreferences` remains the learning-state façade. Browser-only learning preference storage lives in `features/learning/state/localPreferences.ts`; Photo Lab owns its flag storage in `features/photo-lab/client/preferences.ts`.
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
- Compact full suite for agents: `pnpm run test:agent`
- Tests affected by the current diff: `pnpm run test:changed`
- Focused file/directory: `pnpm run test:agent -- <path>`
- Lint: `pnpm run lint`
- Learning state/minigames: `features/learning/**/__tests__`, `lib/__tests__/minigames.test.ts`
- Lists: `features/lists/**/__tests__`, `app/api/lists/__tests__`
- Audio: `app/api/audio/__tests__`, `lib/__tests__/audio*.test.ts`
- Sync: `app/api/sync/__tests__/sync.test.ts`, `lib/__tests__/sync*.test.ts`, `features/learning/state/__tests__`
- Auth/providers: `app/api/auth/__tests__`, `app/api/providers/openrouter/__tests__`, `lib/providers/__tests__`
- Word chat: `features/word-chat/**/__tests__`, `app/api/word-chat/**/__tests__`
- Landing/Photo Lab/admin: `features/landing/**/__tests__`, `features/photo-lab/**/__tests__`, `features/admin/**/__tests__`, `app/api/audio/demo/__tests__`, `app/api/admin/stats/__tests__`
