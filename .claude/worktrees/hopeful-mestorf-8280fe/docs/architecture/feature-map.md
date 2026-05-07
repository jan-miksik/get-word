# Feature Map

Use this file as the first stop before searching the repo.

## Learning Flow

- Start with `features/learning/README.md`
- Page entrypoints:
  - `app/page.tsx`
  - `app/edit/page.tsx`
- First files to open for page behavior:
  - `features/learning/hooks/useWordsLoader.ts`
  - `features/learning/hooks/useWordStream.ts`
  - `features/learning/hooks/usePressHandlers.ts`
  - `features/learning/components/LearningStudyContent.tsx`
  - `features/learning/hooks/useLearningPageState.ts`
  - `features/learning/hooks/useLearningRenderers.tsx`
  - `features/edit/components/EditStudyContent.tsx`
  - `features/edit/hooks/useEditPageState.ts`
- Core shared state and sync:
  - `features/learning/app-state/useServerSync.ts`
  - `features/learning/state/index.ts`
  - `features/auth/state/userProfile.ts`
  - `app/api/sync/route.ts`
  - `features/shared/sync/response.ts`
- Compatibility note:
  - `hooks/useProgress.ts`, `hooks/usePreferences.ts`, `hooks/useMemoryHooks.ts`, `hooks/useCategoryFilter.ts`, `hooks/useGameScore.ts`, `hooks/useUserProfile.ts`, `hooks/useWordsLoader.ts`, `hooks/useWordStream.ts`, and `hooks/usePressHandlers.ts` are legacy barrels. Prefer feature-local imports for new code.

## Lists

- Start with `features/lists/README.md`
- Canonical list types:
  - `features/lists/types.ts`
- Authenticated list client:
  - `features/lists/api.ts`
- Current UI entrypoint:
  - `app/lists/page.tsx`

## Auth

- Start with `features/auth/README.md`
- Client identity state:
  - `features/auth/state/userProfile.ts`
- Route entrypoints:
  - `app/api/auth/link-wallet/route.ts`
  - `app/api/auth/logout/route.ts`
- Shared session response helpers:
  - `features/shared/routes/session.ts`

## Audio

- Start with `features/audio/README.md`
- UI entrypoints:
  - `app/lists/AudioStep.tsx`
  - `components/MiniGameCard.tsx`
- Route entrypoints:
  - `app/api/audio/generate/batch/route.ts`
  - `app/api/audio/[hash]/route.ts`

## Providers

- Start with `features/providers/README.md`
- Current UI entrypoint:
  - `app/lists/ApiKeySettings.tsx`
- Server entrypoints:
  - `app/api/providers/openrouter/*`
  - `app/api/keys/*`

## Shared Route Utilities

- Timing and headers:
  - `features/shared/routes/timing.ts`
- Session cookie responses:
  - `features/shared/routes/session.ts`
- Legacy wordId/itemId helpers and sync response assembly:
  - `features/shared/sync/identity.ts`
  - `features/shared/sync/response.ts`

## Placement Rules

- New feature-specific types should not live in page files.
- New learning state should go under `features/learning/state` or `features/learning/app-state`, not top-level `hooks/`.
- New auth identity state should go under `features/auth/state`.
- New authenticated browser fetch helpers should go through feature API modules, not component-local helpers.
- Route files should stay thin and delegate shared logic into `features/shared/*` or feature-local server modules.
