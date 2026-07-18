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
- `features/learning/hooks/useWordStream.ts`
- `features/learning/hooks/usePressHandlers.ts`
- `features/learning/hooks/useLearningPageState.ts`
- `features/learning/hooks/useLearningRenderers.tsx`
- `features/learning/hooks/usePWAInstallIntro.ts`
- `features/learning/components/LearningStudyContent.tsx`
- `features/learning/onboarding/LearningLanguageOnboarding.tsx`
- `features/learning/onboarding/useLearningOnboardingData.ts`
- `features/learning/onboarding/useLearningOnboardingActions.ts`
- `features/learning/hooks/useLearningStreamGroups.ts`
- `features/learning/hooks/useMinigameFrequencyPreference.ts`
- `features/learning/components/SettlingWordsFooter.tsx`
- `app/page.tsx`
- `hooks/useAppState.ts`

## Notes

- `lib/minigames.ts` is now a compatibility barrel. New code should import from `features/learning/minigames`.
- App hydration, wallet-link sync, active-list persistence, and view-mode persistence now live under `features/learning/app-state`.
- Progress, preferences, memory hooks, category filters, and game-score state now live under `features/learning/state`.
- Study items are hydrated from owned/subscribed `word_list_items` by `features/learning/app-state/useServerSync.ts`; there is no seed-word loader or `/api/words` fallback.
- Word bucketing and `.cover-target` press-state wiring live under `features/learning/hooks`.
- Home-page stream/deck orchestration and render callbacks now live under feature hooks/components instead of `app/page.tsx`.
- The shared minigame preference persistence now lives in `features/learning/hooks/useMinigameFrequencyPreference.ts`.
- Study direction is list-defined: `languageFrom` is the known/source side and `languageTo` is the learning/target side. Reverse study should use or generate a separate reversed list.
- List creation and editing live under `app/lists` and `features/lists`; `/edit` is only a redirect.
