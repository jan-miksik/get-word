# Feature Map

Use `AI_CONTEXT.md` as the first stop for agent sessions. This file is a slightly deeper feature map for humans and agents that already know which area they are changing.

## Ignore Unless Relevant

- `.claude/worktrees/` contains local worktree copies and stale duplicate app files.
- `.next/`, `.next-dev/`, `out/`, `build/`, and `coverage/` are generated output.
- `public/speech/` is static audio asset data.
- `wordbook/` is scratch/import word-list source material.
- `drizzle/migrations/meta/*.json` are generated Drizzle snapshots.
- `styles/*.css` are legacy styling files; new styling should use Tailwind.

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
  - `lib/minigames.ts` re-exports `@/features/learning/minigames`. Prefer the feature path in new code.
  - The former top-level `hooks/use*` barrels (Progress, Preferences, MemoryHooks, CategoryFilter, GameScore, UserProfile, WordsLoader, WordStream, PressHandlers) were removed — import directly from `features/learning/state/*`, `features/learning/hooks/*`, or `features/auth/state/userProfile`.

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
- Client Reown/AppKit flow:
  - `features/auth/client/useAuth.ts`
  - `features/auth/components/AppKitProvider.tsx`
  - `features/auth/client/appkit-auth-features.ts`
  - `features/auth/client/wagmi-config.ts`
- Login/session handoff:
  - `app/login/page.tsx`
  - `app/api/auth/link-wallet/route.ts`
  - `lib/sync.ts`
- Client identity state:
  - `features/auth/state/userProfile.ts`
- Route entrypoints:
  - `app/api/auth/link-wallet/route.ts`
  - `app/api/auth/logout/route.ts`
- Shared session response helpers:
  - `lib/session.ts`
  - `lib/auth.ts`
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
