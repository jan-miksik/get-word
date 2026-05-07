# Learning Feature

## Purpose

Owns the main study experience: word stream composition, progress-driven display, minigames, and learning-page orchestration.

## Read First

- `features/learning/minigames/index.ts`
- `features/learning/app-state/useServerSync.ts`
- `features/learning/app-state/useActiveListState.ts`
- `features/learning/app-state/useViewModePreference.ts`
- `features/learning/state/index.ts`
- `features/learning/state/progress.ts`
- `features/learning/state/preferences.ts`
- `features/learning/hooks/useWordsLoader.ts`
- `features/learning/hooks/useWordStream.ts`
- `features/learning/hooks/usePressHandlers.ts`
- `features/learning/hooks/useLearningPageState.ts`
- `features/learning/hooks/useLearningRenderers.tsx`
- `features/learning/components/LearningStudyContent.tsx`
- `features/learning/components/AuthRequiredCard.tsx`
- `features/learning/hooks/useLearningStreamGroups.ts`
- `features/learning/hooks/useMinigameFrequencyPreference.ts`
- `features/learning/components/SettlingWordsFooter.tsx`
- `app/page.tsx`
- `app/edit/page.tsx`
- `hooks/useAppState.ts`

## Notes

- `lib/minigames.ts` is now a compatibility barrel. New code should import from `features/learning/minigames`.
- App hydration, wallet-link sync, active-list persistence, and view-mode persistence now live under `features/learning/app-state`.
- Progress, preferences, memory hooks, category filters, and game-score state now live under `features/learning/state`.
- Word loading, word bucketing, and `.cover-target` press-state wiring now live under `features/learning/hooks`.
- Home-page stream/deck orchestration and render callbacks now live under feature hooks/components instead of `app/page.tsx`.
- The shared minigame preference persistence now lives in `features/learning/hooks/useMinigameFrequencyPreference.ts`.
- The main remaining hotspots are cross-feature cleanup and reducing remaining compatibility barrels in `hooks/`.
