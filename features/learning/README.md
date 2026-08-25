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
- `features/learning/components/CardDeckView.tsx`
- `features/learning/components/VirtualizedWordList.tsx`
- `features/learning/components/WordCard.tsx`
- `features/learning/components/MiniGameCard.tsx`
- `features/learning/components/typing-study/*`
- `features/learning/onboarding/OnboardingScreen.tsx`
- `features/learning/onboarding/LearningLanguageOnboarding.tsx`
- `features/learning/onboarding/useLearningOnboardingData.ts`
- `features/learning/onboarding/useLearningOnboardingActions.ts`
- `features/learning/hooks/useLearningStreamGroups.ts`
- `features/learning/hooks/useMinigameFrequencyPreference.ts`
- `features/learning/components/SettlingWordsFooter.tsx`
- `app/page.tsx`
- `hooks/useAppState.ts`

## Notes

- Import minigame domain logic directly from `features/learning/minigames`; the old `lib/minigames.ts` compatibility barrel has been removed.
- Deck, stream, word-card, minigame, learning-panel, and learning-settings UI are feature-owned under `features/learning/components`.
- `usePreferences` preserves its façade contract while local browser preference storage is isolated in `features/learning/state/localPreferences.ts`.
- The reusable language picker, supported-language hook, and canonical UI language type live in `features/shared/languages`.
- App hydration, wallet-link sync, active-list persistence, and view-mode persistence now live under `features/learning/app-state`.
- Progress, preferences, memory hooks, category filters, and game-score state now live under `features/learning/state`.
- Study items are hydrated from owned/subscribed `word_list_items` by `features/learning/app-state/useServerSync.ts`; there is no seed-word loader or `/api/words` fallback.
- Word bucketing and `.cover-target` press-state wiring live under `features/learning/hooks`.
- Every first-run step renders inside `features/learning/onboarding/OnboardingScreen.tsx`: it owns the rising-letters background, the sheet (`.onboarding-page-card`), the progress rail, Back, support, and the page's vertical rhythm. Steps supply their question only — do not reintroduce per-step page wrappers, paddings, or card styles.
- Back is an override on top of the resolved step (`onboardingBackTarget` / `applyOnboardingBack` in `onboarding/flow.ts`), because steps are derived from stored answers rather than a cursor. Each step's submit handler clears it; the answers themselves are what a step reopens on.
- Preview any step without an account at `/dev/onboarding/<step>` (`language`, `level`, `goal`, `reminder`, `words`, `done`), and all of them at fixed device sizes — including the short laptop window the goal step has to fit in — at `/dev/onboarding/mobile`.
- Home-page stream/deck orchestration and render callbacks now live under feature hooks/components instead of `app/page.tsx`.
- The shared minigame preference persistence now lives in `features/learning/hooks/useMinigameFrequencyPreference.ts`.
- Study direction is list-defined: `languageFrom` is the known/source side and `languageTo` is the learning/target side. Reverse study should use or generate a separate reversed list.
- List creation and editing live under `app/lists` and `features/lists`; `/edit` is only a redirect.
